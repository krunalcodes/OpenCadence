import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ReceivedMessage } from "@workspace/integration-core";
import { DispatchService, type MessageDto } from "../dispatch/dispatch.service";
import { SendingSourcesService } from "../integrations/sending-sources.service";
import { SuppressionService } from "../suppression/suppression.service";
import { classifyReceived } from "./reply-classifier";
import {
  maxReferencesChecked,
  maxReplyPagesPerRun,
  replyFirstLookbackMs,
  replyOverlapMs,
  replyPageSize,
  replySourceRecencyMs,
  SEQUENCE_CLOCK,
  type SequenceClock,
  type SequenceScope,
} from "./sequences.constants";
import { SequencesRepository } from "./sequences.repository";

export type ReplyRunResult = {
  sources: number;
  unsupported: number;
  failed: number;
  replies: number;
  autoReplies: number;
  bounces: number;
};

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

@Injectable()
export class ReplyDetector {
  private readonly logger = new Logger(ReplyDetector.name);

  constructor(
    @Inject(SequencesRepository)
    private readonly repository: SequencesRepository,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
    @Inject(SEQUENCE_CLOCK) private readonly clock: SequenceClock,
  ) {}

  async run(
    now = this.clock.now(),
    scope: SequenceScope = {},
  ): Promise<ReplyRunResult> {
    const result: ReplyRunResult = {
      sources: 0,
      unsupported: 0,
      failed: 0,
      replies: 0,
      autoReplies: 0,
      bounces: 0,
    };
    const targets = await this.repository.listReplySources({
      activeSince: new Date(now.getTime() - replySourceRecencyMs),
      workspaceIds: scope.workspaceIds,
    });
    const mailboxes = new Map<
      string,
      Map<string, { email: string | null; integrationType: string }>
    >();
    for (const target of targets) {
      let known = mailboxes.get(target.workspaceId);
      if (!known) {
        const { sources } = await this.sources.list(target.workspaceId);
        known = new Map(sources.map((source) => [source.id, source]));
        mailboxes.set(target.workspaceId, known);
      }
      const mailbox = known.get(target.sourceId);
      if (!mailbox || !this.sources.hasInbox(mailbox.integrationType)) {
        continue;
      }
      result.sources += 1;
      if (!this.sources.canDetectReplies(mailbox.integrationType)) {
        result.unsupported += 1;
        continue;
      }
      try {
        await this.check(target, mailbox.email, now, result);
      } catch (error) {
        result.failed += 1;
        this.logger.warn(
          `Replies for source ${target.sourceId} could not be read: ${
            error instanceof Error ? error.name : "unknown error"
          }`,
        );
      }
    }
    return result;
  }

  private async check(
    target: { workspaceId: string; sourceId: string },
    mailboxEmail: string | null,
    now: Date,
    result: ReplyRunResult,
  ) {
    const cursor = await this.repository.findReplyCursor(target.sourceId);
    const since = new Date(
      cursor?.lastCheckedAt
        ? cursor.lastCheckedAt.getTime() - replyOverlapMs
        : now.getTime() - replyFirstLookbackMs,
    );
    let state = cursor?.state ?? null;
    for (let page = 0; page < maxReplyPagesPerRun; page += 1) {
      const received = await this.sources.withInbox(
        target.sourceId,
        async (inbox, credentials) =>
          (await inbox.listReceived?.(credentials, {
            since,
            state,
            limit: replyPageSize,
          })) ?? null,
      );
      if (!received) {
        result.unsupported += 1;
        return;
      }
      for (const message of received.messages) {
        await this.handle(target, mailboxEmail, message, result);
      }
      state = received.state;
      if (!received.more) {
        await this.repository.saveReplyCursor({
          workspaceId: target.workspaceId,
          sourceId: target.sourceId,
          lastCheckedAt: now,
          state,
        });
        return;
      }
    }
    await this.repository.saveReplyCursor({
      workspaceId: target.workspaceId,
      sourceId: target.sourceId,
      lastCheckedAt: cursor?.lastCheckedAt ?? since,
      state,
    });
  }

  private async handle(
    target: { workspaceId: string; sourceId: string },
    mailboxEmail: string | null,
    received: ReceivedMessage,
    result: ReplyRunResult,
  ) {
    const { kind, references } = classifyReceived(received, mailboxEmail);
    if (kind === "ignored") {
      return;
    }
    const message = await this.findOurs(target.workspaceId, references);
    if (!message) {
      return;
    }
    if (kind === "auto_reply") {
      result.autoReplies += 1;
      return;
    }
    if (kind === "bounce") {
      if (message.status === "bounced") {
        return;
      }
      const email = bouncedAddress(message, received);
      if (email) {
        await this.suppression.record({
          workspaceId: target.workspaceId,
          email,
          reason: "bounced",
          origin: "webhook",
          sourceId: target.sourceId,
          messageId: message.id,
          note: "A bounce notice arrived in the mailbox.",
        });
      }
      await this.dispatch.recordEvent({
        messageId: message.id,
        type: "bounced",
        occurredAt: received.receivedAt,
      });
      result.bounces += 1;
      return;
    }
    if (message.repliedAt) {
      return;
    }
    await this.dispatch.recordEvent({
      messageId: message.id,
      type: "replied",
      occurredAt: received.receivedAt,
    });
    result.replies += 1;
  }

  private async findOurs(
    workspaceId: string,
    references: string[],
  ): Promise<MessageDto | null> {
    for (const reference of references.slice(0, maxReferencesChecked)) {
      const message = await this.dispatch.findByRfcMessageId(
        workspaceId,
        reference,
      );
      if (message?.sequenceId && message.enrollmentId) {
        return message;
      }
    }
    return null;
  }
}
