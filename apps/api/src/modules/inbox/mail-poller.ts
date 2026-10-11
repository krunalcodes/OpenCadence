import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  IntegrationError,
  type ReceivedContent,
  type ReceivedMessage,
  toIntegrationError,
} from "@workspace/integration-core";
import { REDIS, type Redis } from "../../infra/redis/redis.module";
import { DispatchService, type MessageDto } from "../dispatch/dispatch.service";
import {
  type SendingSourceDto,
  SendingSourcesService,
} from "../integrations/sending-sources.service";
import {
  isValidEmail,
  normalizeEmail,
  SuppressionService,
} from "../suppression/suppression.service";
import {
  attemptMemorySeconds,
  credentialFailureCodes,
  failureMemorySeconds,
  firstLookbackMs,
  maxPagesPerRun,
  maxReferencesChecked,
  type PollOptions,
  type PollScope,
  pollAttemptsKey,
  pollBlockedKey,
  pollDefaults,
  polledKinds,
  pollFailuresKey,
  pollLockKey,
  pollOverlapMs,
  pollPageSize,
  sourceRecencyMs,
} from "./inbox.constants";
import { InboxRepository, type ThreadSeed } from "./inbox.repository";
import { classifyReceived } from "./reply-classifier";
import {
  baseSubject,
  isRfcMessageId,
  maxSubjectLength,
  safeContent,
  snippetOf,
  syntheticMessageId,
} from "./reply-text";

export type PollRunResult = {
  sources: number;
  unsupported: number;
  needsAttention: number;
  backedOff: number;
  busy: number;
  failed: number;
  outOfTime: number;
  replies: number;
  stored: number;
  autoReplies: number;
  bounces: number;
  retrying: number;
  skipped: number;
};

type Target = {
  workspaceId: string;
  sourceId: string;
  email: string | null;
};

const releaseLock =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

const maxNameLength = 200;
const maxRecipients = 50;

function emptyResult(): PollRunResult {
  return {
    sources: 0,
    unsupported: 0,
    needsAttention: 0,
    backedOff: 0,
    busy: 0,
    failed: 0,
    outOfTime: 0,
    replies: 0,
    stored: 0,
    autoReplies: 0,
    bounces: 0,
    retrying: 0,
    skipped: 0,
  };
}

function bouncedAddress(message: MessageDto, received: ReceivedMessage) {
  const reported = received.deliveryStatus?.failedRecipient
    ?.trim()
    .toLowerCase();
  const recipients = [...message.to, ...message.cc, ...message.bcc];
  return (
    recipients.find((email) => email.toLowerCase() === reported) ??
    message.to[0]
  );
}

function messageKey(received: ReceivedMessage) {
  return createHash("sha256")
    .update(
      received.messageId ??
        received.ref ??
        `${received.receivedAt.toISOString()}|${received.from?.email ?? ""}`,
    )
    .digest("hex")
    .slice(0, 32);
}

function storedRfcId(sourceId: string, received: ReceivedMessage) {
  const given = received.messageId?.trim();
  return isRfcMessageId(given)
    ? (given ?? "")
    : syntheticMessageId(messageKey(received), sourceId);
}

function withTimeout<T>(run: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new IntegrationError(
            "temporary",
            "The mailbox took too long to answer.",
          ),
        ),
      ms,
    );
    run().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function inParallel<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
) {
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (next < items.length) {
        const item = items[next];
        next += 1;
        if (item !== undefined) {
          await run(item);
        }
      }
    },
  );
  await Promise.all(workers);
}

@Injectable()
export class MailPoller {
  private readonly logger = new Logger(MailPoller.name);

  constructor(
    @Inject(InboxRepository) private readonly repository: InboxRepository,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async run(
    now = new Date(),
    scope: PollScope = {},
    overrides: Partial<PollOptions> = {},
  ): Promise<PollRunResult> {
    const options = { ...pollDefaults, ...overrides };
    const result = emptyResult();
    const senders = await this.dispatch.recentSenders({
      since: new Date(now.getTime() - sourceRecencyMs),
      kinds: polledKinds,
      workspaceIds: scope.workspaceIds,
      accepts: (integrationType) =>
        this.sources.hasInbox(integrationType) ||
        this.sources.readsMail(integrationType),
    });
    const mailboxes = new Map<string, Map<string, SendingSourceDto>>();
    const targets: Target[] = [];
    for (const sender of senders) {
      let known = mailboxes.get(sender.workspaceId);
      if (!known) {
        const { sources } = await this.sources.list(sender.workspaceId);
        known = new Map(sources.map((source) => [source.id, source]));
        mailboxes.set(sender.workspaceId, known);
      }
      const mailbox = known.get(sender.sourceId);
      if (!mailbox) {
        continue;
      }
      result.sources += 1;
      if (!this.sources.canDetectReplies(mailbox)) {
        result.unsupported += 1;
      } else if (mailbox.status === "needs_attention") {
        result.needsAttention += 1;
      } else {
        targets.push({
          workspaceId: sender.workspaceId,
          sourceId: sender.sourceId,
          email: mailbox.email,
        });
      }
    }
    await inParallel(targets, options.concurrency, (target) =>
      this.pollSource(target, now, options, result),
    );
    return result;
  }

  private async pollSource(
    target: Target,
    now: Date,
    options: PollOptions,
    result: PollRunResult,
  ) {
    if ((await this.redis.exists(pollBlockedKey(target.sourceId))) > 0) {
      result.backedOff += 1;
      return;
    }
    const lockKey = pollLockKey(target.sourceId);
    const token = randomUUID();
    const locked = await this.redis.set(
      lockKey,
      token,
      "PX",
      options.sourceBudgetMs + 2 * options.callTimeoutMs,
      "NX",
    );
    if (locked !== "OK") {
      result.busy += 1;
      return;
    }
    try {
      await this.check(
        target,
        now,
        options,
        result,
        Date.now() + options.sourceBudgetMs,
      );
      await this.redis.del(pollFailuresKey(target.sourceId));
    } catch (error) {
      result.failed += 1;
      await this.recordFailure(target, error, options).catch(() => undefined);
    } finally {
      await this.redis.eval(releaseLock, 1, lockKey, token).catch(() => 0);
    }
  }

  private async recordFailure(
    target: Target,
    error: unknown,
    options: PollOptions,
  ) {
    const failure = toIntegrationError(error);
    this.logger.warn(
      `Mail for source ${target.sourceId} could not be read: ${failure.code}`,
    );
    const key = pollFailuresKey(target.sourceId);
    const failures = await this.redis.incr(key);
    await this.redis.expire(key, failureMemorySeconds);
    await this.redis.set(
      pollBlockedKey(target.sourceId),
      "1",
      "PX",
      Math.min(
        options.backoffBaseMs * 2 ** Math.min(failures - 1, 16),
        options.backoffMaxMs,
      ),
    );
    if (credentialFailureCodes.includes(failure.code)) {
      await this.sources.test(
        { workspaceId: target.workspaceId, userId: null },
        target.sourceId,
      );
    }
  }

  private async check(
    target: Target,
    now: Date,
    options: PollOptions,
    result: PollRunResult,
    deadline: number,
  ) {
    const cursor = await this.repository.findCursor(target.sourceId);
    const since = new Date(
      cursor?.lastCheckedAt
        ? cursor.lastCheckedAt.getTime() - pollOverlapMs
        : now.getTime() - firstLookbackMs,
    );
    const resumeAt =
      cursor?.lastCheckedAt ?? new Date(since.getTime() + pollOverlapMs);
    if (!cursor) {
      await this.repository.saveCursor({
        workspaceId: target.workspaceId,
        sourceId: target.sourceId,
        lastCheckedAt: resumeAt,
        state: null,
      });
    }
    let state = cursor?.state ?? null;
    for (let page = 0; page < maxPagesPerRun; page += 1) {
      if (Date.now() >= deadline) {
        result.outOfTime += 1;
        return;
      }
      const received = await withTimeout(
        () =>
          this.sources.withInbox(
            target.sourceId,
            async (inbox, credentials) =>
              (await inbox.listReceived?.(credentials, {
                since,
                state,
                limit: pollPageSize,
              })) ?? null,
          ),
        options.callTimeoutMs,
      );
      if (!received) {
        result.unsupported += 1;
        return;
      }
      let complete = true;
      for (const message of received.messages) {
        if (Date.now() >= deadline) {
          result.outOfTime += 1;
          return;
        }
        if (!(await this.attempt(target, message, options, result))) {
          complete = false;
        }
      }
      if (!complete) {
        return;
      }
      state = received.state;
      await this.repository.saveCursor({
        workspaceId: target.workspaceId,
        sourceId: target.sourceId,
        lastCheckedAt: received.more ? resumeAt : now,
        state,
      });
      if (!received.more) {
        return;
      }
    }
  }

  private async attempt(
    target: Target,
    received: ReceivedMessage,
    options: PollOptions,
    result: PollRunResult,
  ) {
    try {
      await this.handle(target, received, options, result);
      return true;
    } catch (error) {
      const failure = toIntegrationError(error);
      if (credentialFailureCodes.includes(failure.code)) {
        throw error;
      }
      const key = pollAttemptsKey(target.sourceId, messageKey(received));
      const attempts = await this.redis.incr(key);
      await this.redis.expire(key, attemptMemorySeconds);
      if (attempts < options.maxMessageAttempts) {
        result.retrying += 1;
        return false;
      }
      result.skipped += 1;
      this.logger.warn(
        `A received message for source ${target.sourceId} was skipped after ${attempts} attempts: ${failure.code}`,
      );
      await this.redis.del(key);
      return true;
    }
  }

  private async handle(
    target: Target,
    received: ReceivedMessage,
    options: PollOptions,
    result: PollRunResult,
  ) {
    const { kind, references } = classifyReceived(received, target.email);
    if (kind === "ignored") {
      return;
    }
    const checked = references.slice(0, maxReferencesChecked);
    const ours = await this.findOurs(target.workspaceId, checked);
    if (kind === "auto_reply") {
      result.autoReplies += ours ? 1 : 0;
      return;
    }
    if (kind === "bounce") {
      if (ours) {
        await this.recordBounce(target, ours, received, result);
      }
      return;
    }
    const thread = await this.repository.findThreadByRfcIds(
      target.workspaceId,
      target.sourceId,
      checked,
    );
    if (!ours && !thread) {
      return;
    }
    let counted = false;
    if (ours && !ours.repliedAt) {
      await this.dispatch.recordEvent({
        messageId: ours.id,
        type: "replied",
        occurredAt: received.receivedAt,
      });
      counted = true;
    }
    const rfcMessageId = storedRfcId(target.sourceId, received);
    const fromEmail = normalizeEmail(received.from?.email ?? "");
    let stored = false;
    if (
      isValidEmail(fromEmail) &&
      !(await this.repository.hasMessage(target.workspaceId, rfcMessageId))
    ) {
      const content = await this.readContent(target, received, options);
      const seed = thread
        ? null
        : await this.seedThread(target.workspaceId, received, ours, content);
      const safe = safeContent({ text: content?.text, html: content?.html });
      const outcome = await this.repository.storeInbound({
        workspaceId: target.workspaceId,
        sourceId: target.sourceId,
        threadId: thread?.id ?? null,
        seed,
        rfcMessageId,
        inReplyTo: isRfcMessageId(received.inReplyTo)
          ? (received.inReplyTo ?? null)
          : null,
        fromEmail,
        fromName: content?.from?.name?.trim().slice(0, maxNameLength) || null,
        toEmails: (content?.to ?? [])
          .map(normalizeEmail)
          .filter(isValidEmail)
          .slice(0, maxRecipients),
        subject: (content?.subject ?? "").trim().slice(0, maxSubjectLength),
        text: safe.text,
        html: safe.html,
        snippet: snippetOf(safe.text ?? ""),
        occurredAt: received.receivedAt,
      });
      stored = outcome.stored;
    }
    result.stored += stored ? 1 : 0;
    result.replies += stored || counted ? 1 : 0;
  }

  private async recordBounce(
    target: Target,
    ours: MessageDto,
    received: ReceivedMessage,
    result: PollRunResult,
  ) {
    if (ours.status === "bounced") {
      return;
    }
    const email = bouncedAddress(ours, received);
    if (email) {
      await this.suppression.record({
        workspaceId: target.workspaceId,
        email,
        reason: "bounced",
        origin: "webhook",
        sourceId: target.sourceId,
        messageId: ours.id,
        note: "A bounce notice arrived in the mailbox.",
      });
    }
    await this.dispatch.recordEvent({
      messageId: ours.id,
      type: "bounced",
      occurredAt: received.receivedAt,
    });
    result.bounces += 1;
  }

  private async readContent(
    target: Target,
    received: ReceivedMessage,
    options: PollOptions,
  ): Promise<ReceivedContent | null> {
    const { ref } = received;
    if (!ref) {
      return null;
    }
    try {
      return await withTimeout(
        () =>
          this.sources.withInbox(
            target.sourceId,
            async (inbox, credentials) =>
              (await inbox.fetchReceived?.(credentials, ref)) ?? null,
          ),
        options.callTimeoutMs,
      );
    } catch (error) {
      if (credentialFailureCodes.includes(toIntegrationError(error).code)) {
        throw error;
      }
      const earlier = Number(
        await this.redis.get(
          pollAttemptsKey(target.sourceId, messageKey(received)),
        ),
      );
      if ((earlier || 0) + 1 < options.maxMessageAttempts) {
        throw error;
      }
      return null;
    }
  }

  private async seedThread(
    workspaceId: string,
    received: ReceivedMessage,
    ours: MessageDto | null,
    content: ReceivedContent | null,
  ): Promise<ThreadSeed | null> {
    const oldestFirst = [
      ...received.references,
      ...(received.inReplyTo ? [received.inReplyTo] : []),
    ];
    const root =
      (await this.findOurs(
        workspaceId,
        [...new Set(oldestFirst)].slice(0, maxReferencesChecked),
      )) ?? ours;
    if (!root?.rfcMessageId) {
      return null;
    }
    return {
      rootMessageId: root.id,
      rootRfcMessageId: root.rfcMessageId,
      contactId: root.contactId,
      campaignId: root.campaignId,
      sequenceId: root.sequenceId,
      enrollmentId: root.enrollmentId,
      subject: (
        baseSubject(root.subject) || baseSubject(content?.subject ?? "")
      ).slice(0, maxSubjectLength),
    };
  }

  private async findOurs(
    workspaceId: string,
    references: string[],
  ): Promise<MessageDto | null> {
    for (const reference of references) {
      const message = await this.dispatch.findByRfcMessageId(
        workspaceId,
        reference,
      );
      if (message && message.kind !== "test") {
        return message;
      }
    }
    return null;
  }
}
