import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type InboxAction,
  toIntegrationError,
} from "@workspace/integration-core";
import { uuidv7 } from "../../common/uuid";
import {
  type SendingSourceDto,
  SendingSourcesService,
  SourceUnavailableError,
} from "../integrations/sending-sources.service";
import {
  dayMs,
  failuresBeforePause,
  maxSendBatchesPerRun,
  pruneBatchSize,
  realSendingCap,
  replyDelayMaxMs,
  replyDelayMinMs,
  retentionDays,
  searchSlackMs,
  sendBatchSize,
  signInFailureCodes,
  syncBatchSize,
  syncMaxAgeMs,
  syncMinAgeMs,
  WARMUP_CONTENT,
  WARMUP_RANDOM,
  type WarmupPausedReason,
  type WarmupRandom,
  type WarmupScope,
  warmupFolderName,
} from "./warmup.constants";
import {
  replySubject,
  type WarmupContentGenerator,
  withIdentifier,
} from "./warmup.content";
import {
  capForRealSending,
  choosePartner,
  dayStart,
  eligiblePartners,
  isSendingDay,
  planningWindowEnd,
  rampDay,
  rampTarget,
  randomInt,
  randomizedTarget,
  replyIsPlanned,
  spreadSendTimes,
  startOfUtcDay,
  utcDay,
} from "./warmup.ramp";
import {
  type MailboxRow,
  type NewWarmupMessageRow,
  type WarmupMessageRow,
  WarmupRepository,
} from "./warmup.repository";

type SourceLookup = (
  workspaceId: string,
  sourceId: string,
) => Promise<SendingSourceDto | null>;

type Failure = { code: string; message: string };

type SendState = {
  limited: Set<string>;
  failed: Map<string, Failure>;
  bounced: Map<string, Failure>;
  from: Date;
  to: Date;
  unavailable: Map<string, Failure>;
  sent: number;
  failures: number;
};

type Transaction = Parameters<
  Parameters<WarmupRepository["transaction"]>[0]
>[0];

@Injectable()
export class WarmupEngine {
  private readonly logger = new Logger(WarmupEngine.name);

  constructor(
    @Inject(WarmupRepository) private readonly repository: WarmupRepository,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(WARMUP_RANDOM) private readonly random: WarmupRandom,
    @Inject(WARMUP_CONTENT) private readonly content: WarmupContentGenerator,
  ) {}

  async plan(now = new Date(), scope?: WarmupScope) {
    const lookup = this.sourceLookup();
    const pool: { mailbox: MailboxRow; sentToday: number }[] = [];
    for (const mailbox of await this.repository.listActiveMailboxes(scope)) {
      const source = await lookup(mailbox.workspaceId, mailbox.sourceId);
      if (!source?.email || source.status !== "active") {
        await this.pause(mailbox.sourceId, "source_unavailable", {
          code:
            source && source.status !== "active"
              ? `source_${source.status}`
              : "source_missing",
          message:
            source && source.status !== "active"
              ? "The sending source is paused or needs attention."
              : "The sending source was disconnected or has no address.",
        });
        continue;
      }
      pool.push({ mailbox, sentToday: source.sentToday });
    }

    const members = pool.map((entry) => entry.mailbox);
    let planned = 0;
    for (const { mailbox, sentToday } of pool) {
      try {
        planned += await this.planMailbox(mailbox, members, sentToday, now);
      } catch (error) {
        this.logger.error(
          `Could not plan warm-up for source ${mailbox.sourceId}.`,
          error,
        );
      }
    }
    return { mailboxes: pool.length, planned };
  }

  async sendDue(now = new Date(), scope?: WarmupScope) {
    const lookup = this.sourceLookup();
    const from = startOfUtcDay(now);
    const to = new Date(from.getTime() + dayMs);
    const state: SendState = {
      limited: new Set(),
      failed: new Map(),
      bounced: new Map(),
      unavailable: new Map(),
      from,
      to,
      sent: 0,
      failures: 0,
    };

    for (let batch = 0; batch < maxSendBatchesPerRun; batch += 1) {
      const claimed = await this.repository.transaction(async (tx) => {
        const rows = await this.repository.claimDue(
          now,
          sendBatchSize,
          tx,
          scope,
        );
        for (const row of rows) {
          await this.sendOne(row, now, tx, lookup, state);
        }
        return rows.length;
      });

      for (const [sourceId, failure] of state.unavailable) {
        await this.pause(sourceId, "source_unavailable", failure);
      }
      for (const sourceId of state.limited) {
        await this.repository.failScheduledBefore(
          sourceId,
          to,
          "daily_limit_reached",
        );
      }
      for (const [sourceId, failure] of state.failed) {
        await this.repository.updateMailbox(sourceId, {
          lastErrorCode: failure.code,
          lastErrorMessage: failure.message.slice(0, 2000),
        });
      }
      for (const [sourceId, failure] of state.bounced) {
        await this.pause(sourceId, "bounces", failure);
      }
      state.unavailable.clear();
      state.failed.clear();

      if (claimed < sendBatchSize) {
        break;
      }
    }
    return { sent: state.sent, failed: state.failures };
  }

  async sync(now = new Date(), scope?: WarmupScope) {
    let received = 0;
    for (const mailbox of await this.repository.listReadableMailboxes(scope)) {
      try {
        received += await this.syncMailbox(mailbox, now);
      } catch (error) {
        await this.syncFailed(mailbox, error);
      }
    }
    const missing = await this.repository.markMissing(
      new Date(now.getTime() - syncMaxAgeMs),
      scope,
    );
    return { received, missing };
  }

  async prune(now = new Date()) {
    const cutoff = new Date(now.getTime() - retentionDays * dayMs);
    let deleted = 0;
    for (;;) {
      const count = await this.repository.deleteMessagesBefore(
        cutoff,
        pruneBatchSize,
      );
      deleted += count;
      if (count < pruneBatchSize) {
        return { deleted };
      }
    }
  }

  private async planMailbox(
    mailbox: MailboxRow,
    pool: MailboxRow[],
    sentToday: number,
    now: Date,
  ) {
    const today = utcDay(now);
    const from = startOfUtcDay(now);
    const to = new Date(from.getTime() + dayMs);
    const plannedToday =
      mailbox.plannedOn === today && mailbox.plannedCount > 0;
    if (plannedToday && mailbox.plannedCount <= realSendingCap) {
      return 0;
    }

    const warmupSent = await this.repository.countSent(
      mailbox.sourceId,
      from,
      to,
    );
    const realSent = Math.max(0, sentToday - warmupSent);
    if (plannedToday) {
      if (realSent > 0) {
        await this.trimForRealSending(mailbox.sourceId, today, from, to);
      }
      return 0;
    }

    return this.repository.transaction(async (tx) => {
      const locked = await this.repository.lockMailbox(mailbox.sourceId, tx);
      if (
        !locked?.enabled ||
        locked.pausedReason ||
        !locked.startedOn ||
        (locked.plannedOn === today && locked.plannedCount > 0)
      ) {
        return 0;
      }

      const newDay = locked.plannedOn !== today;
      let holdDays = locked.holdDays;
      if (locked.plannedOn && newDay) {
        holdDays += await this.repository.countHeldDays(
          locked.sourceId,
          dayStart(locked.plannedOn),
          from,
          tx,
        );
      }

      const rows: NewWarmupMessageRow[] = [];
      let plannedCount = 0;
      const windowEnd = planningWindowEnd(now);
      const partners = eligiblePartners(locked, pool);
      if (
        partners.length > 0 &&
        now < windowEnd &&
        isSendingDay(now, locked.weekdaysOnly)
      ) {
        const base = rampTarget(
          locked,
          rampDay(locked.startedOn, holdDays, today),
        );
        const target = capForRealSending(
          locked.randomize ? randomizedTarget(base, this.random) : base,
          realSent,
        );
        const existing = await this.repository.countOpeners(
          locked.sourceId,
          from,
          to,
          tx,
        );
        const times = spreadSendTimes(
          target - existing,
          now,
          windowEnd,
          this.random,
        );
        for (const sendAt of times) {
          const partner = choosePartner(locked, pool, this.random);
          if (partner) {
            rows.push(await this.openerRow(locked, partner, sendAt));
          }
        }
        plannedCount = existing + rows.length;
      }

      await this.repository.insertMessages(rows, tx);
      await this.repository.updateMailbox(
        locked.sourceId,
        {
          holdDays,
          plannedOn: today,
          plannedCount,
          ...(newDay ? { lastErrorCode: null, lastErrorMessage: null } : {}),
        },
        tx,
      );
      return rows.length;
    });
  }

  private trimForRealSending(
    sourceId: string,
    today: string,
    from: Date,
    to: Date,
  ) {
    return this.repository.transaction(async (tx) => {
      const locked = await this.repository.lockMailbox(sourceId, tx);
      if (
        !locked ||
        locked.plannedOn !== today ||
        locked.plannedCount <= realSendingCap
      ) {
        return;
      }
      const existing = await this.repository.countOpeners(
        sourceId,
        from,
        to,
        tx,
      );
      const removed =
        existing > realSendingCap
          ? await this.repository.trimScheduledOpeners(
              sourceId,
              from,
              to,
              existing - realSendingCap,
              tx,
            )
          : 0;
      await this.repository.updateMailbox(
        sourceId,
        { plannedCount: existing - removed },
        tx,
      );
    });
  }

  private async openerRow(
    sender: MailboxRow,
    partner: MailboxRow,
    sendAt: Date,
  ): Promise<NewWarmupMessageRow> {
    const id = uuidv7();
    const content = await this.content.opener({ seed: id });
    return {
      id,
      threadId: id,
      kind: "opener",
      senderSourceId: sender.sourceId,
      senderWorkspaceId: sender.workspaceId,
      recipientSourceId: partner.sourceId,
      recipientWorkspaceId: partner.workspaceId,
      rfcMessageId: `<${id}@${sender.domain}>`,
      subject: content.subject,
      replyPlanned: replyIsPlanned(partner.replyRate, this.random),
      sendAt,
    };
  }

  private replyRow(
    opener: WarmupMessageRow,
    mailbox: MailboxRow,
    now: Date,
  ): NewWarmupMessageRow {
    const id = uuidv7();
    return {
      id,
      threadId: opener.threadId,
      kind: "reply",
      senderSourceId: mailbox.sourceId,
      senderWorkspaceId: mailbox.workspaceId,
      recipientSourceId: opener.senderSourceId,
      recipientWorkspaceId: opener.senderWorkspaceId,
      rfcMessageId: `<${id}@${mailbox.domain}>`,
      inReplyTo: opener.rfcMessageId,
      subject: replySubject(opener.subject),
      replyPlanned: false,
      sendAt: new Date(
        now.getTime() +
          randomInt(this.random, replyDelayMinMs, replyDelayMaxMs),
      ),
    };
  }

  private async sendOne(
    row: WarmupMessageRow,
    now: Date,
    tx: Transaction,
    lookup: SourceLookup,
    state: SendState,
  ) {
    const fail = async (code: string) => {
      state.failures += 1;
      await this.repository.updateMessage(
        row.id,
        { status: "failed", errorCode: code },
        "scheduled",
        tx,
      );
    };

    if (state.limited.has(row.senderSourceId)) {
      return fail("daily_limit_reached");
    }
    if (state.bounced.has(row.senderSourceId)) {
      return fail("warmup_paused");
    }
    const mailboxes = await this.repository.findMailboxesByIds([
      row.senderSourceId,
      row.recipientSourceId,
    ]);
    const sender = mailboxes.find(
      (mailbox) => mailbox.sourceId === row.senderSourceId,
    );
    const recipient = mailboxes.find(
      (mailbox) => mailbox.sourceId === row.recipientSourceId,
    );
    if (!sender?.enabled || sender.pausedReason) {
      return fail("warmup_paused");
    }
    if (!recipient?.enabled || recipient.pausedReason) {
      return fail("partner_unavailable");
    }
    const from = await lookup(sender.workspaceId, sender.sourceId);
    const to = await lookup(recipient.workspaceId, recipient.sourceId);
    if (!from?.email) {
      state.unavailable.set(sender.sourceId, {
        code: "source_missing",
        message: "The sending source was disconnected.",
      });
      return fail("source_missing");
    }
    if (!to?.email) {
      return fail("partner_unavailable");
    }

    const context = { seed: row.id, subject: row.subject };
    const content =
      row.kind === "reply"
        ? await this.content.reply(context)
        : await this.content.opener(context);

    try {
      await this.sources.deliver(sender.workspaceId, sender.sourceId, {
        from: { email: from.email },
        to: [to.email],
        subject: row.subject,
        text: withIdentifier(content.text, sender.identifier),
        messageId: row.rfcMessageId,
        thread: row.inReplyTo
          ? { inReplyTo: row.inReplyTo, references: [row.inReplyTo] }
          : undefined,
        idempotencyKey: row.id,
      });
    } catch (error) {
      if (error instanceof SourceUnavailableError) {
        state.unavailable.set(sender.sourceId, {
          code: error.code,
          message: error.message,
        });
        return fail(error.code);
      }
      const failure = toIntegrationError(error);
      await fail(failure.code);
      if (failure.code === "daily_limit_reached") {
        state.limited.add(sender.sourceId);
        return;
      }
      const reason = { code: failure.code, message: failure.message };
      state.failed.set(sender.sourceId, reason);
      const failures = await this.repository.countFailures(
        sender.sourceId,
        state.from,
        state.to,
        tx,
      );
      if (failures >= failuresBeforePause) {
        state.bounced.set(sender.sourceId, reason);
      }
      return;
    }

    state.sent += 1;
    await this.repository.updateMessage(
      row.id,
      { status: "sent", sentAt: now, errorCode: null },
      "scheduled",
      tx,
    );
  }

  private async syncMailbox(mailbox: MailboxRow, now: Date) {
    const pending = await this.repository.listPending(
      mailbox.sourceId,
      new Date(now.getTime() - syncMaxAgeMs),
      new Date(now.getTime() - syncMinAgeMs),
      syncBatchSize,
    );
    if (pending.length === 0) {
      return 0;
    }

    return this.sources.withInbox(
      mailbox.sourceId,
      async (inbox, credentials) => {
        let folderId = mailbox.folderId;
        if (!folderId) {
          const folder = await inbox.ensureFolder(
            credentials,
            warmupFolderName,
          );
          folderId = folder.providerFolderId;
          await this.repository.updateMailbox(mailbox.sourceId, { folderId });
        }

        let received = 0;
        for (const message of pending) {
          const found = await inbox.search(credentials, {
            messageId: message.rfcMessageId,
            since: new Date(
              (message.sentAt ?? message.sendAt).getTime() - searchSlackMs,
            ),
            includeSpam: true,
          });
          if (!found) {
            continue;
          }
          const inSpam = found.flags.isSpam;
          const reply =
            message.kind === "opener" &&
            message.replyPlanned &&
            !mailbox.pausedReason
              ? this.replyRow(message, mailbox, now)
              : null;
          const recorded = await this.repository.recordReceived(
            message.id,
            { landedIn: inSpam ? "spam" : "inbox", receivedAt: now },
            reply,
          );
          if (!recorded) {
            continue;
          }
          received += 1;

          const actions: InboxAction[] = [
            ...(inSpam ? [{ type: "notSpam" as const }] : []),
            { type: "markRead" },
            { type: "markImportant" },
            {
              type: "fileUnder",
              folder: { providerFolderId: folderId, name: warmupFolderName },
            },
          ];
          try {
            const result = await inbox.applyActions(
              credentials,
              {
                providerMessageId: found.providerMessageId,
                providerThreadId: found.providerThreadId,
                folder: found.folder,
              },
              actions,
            );
            if (inSpam && !result.unsupported.includes("notSpam")) {
              await this.repository.setRescued(message.id);
            }
          } catch (error) {
            await this.repository.updateMailbox(mailbox.sourceId, {
              folderId: null,
            });
            throw error;
          }
        }
        await this.repository.updateMailbox(mailbox.sourceId, {
          lastSyncedAt: now,
        });
        return received;
      },
    );
  }

  private async syncFailed(mailbox: MailboxRow, error: unknown) {
    if (error instanceof SourceUnavailableError) {
      await this.pause(mailbox.sourceId, "source_unavailable", {
        code: error.code,
        message: error.message,
      });
      return;
    }
    const failure = toIntegrationError(error);
    if (signInFailureCodes.includes(failure.code)) {
      await this.pause(mailbox.sourceId, "sign_in_failed", failure);
      return;
    }
    this.logger.warn(
      `Warm-up sync failed for source ${mailbox.sourceId}: ${failure.code}`,
    );
    await this.repository.updateMailbox(mailbox.sourceId, {
      lastErrorCode: failure.code,
      lastErrorMessage: failure.message.slice(0, 2000),
    });
  }

  private async pause(
    sourceId: string,
    reason: WarmupPausedReason,
    failure: Failure,
  ) {
    const paused = await this.repository.pauseMailbox(
      sourceId,
      reason,
      failure,
    );
    if (paused) {
      await this.repository.deleteScheduled(sourceId);
      this.logger.warn(`Paused warm-up for source ${sourceId}: ${reason}.`);
    }
  }

  private sourceLookup(): SourceLookup {
    const cache = new Map<string, Promise<Map<string, SendingSourceDto>>>();
    return async (workspaceId, sourceId) => {
      let sources = cache.get(workspaceId);
      if (!sources) {
        sources = this.sources
          .list(workspaceId)
          .then(
            (result) =>
              new Map(result.sources.map((source) => [source.id, source])),
          );
        cache.set(workspaceId, sources);
      }
      return (await sources).get(sourceId) ?? null;
    };
  }
}
