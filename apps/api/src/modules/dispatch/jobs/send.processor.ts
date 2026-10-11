import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import {
  IntegrationError,
  toIntegrationError,
} from "@workspace/integration-core";
import { DelayedError, type Job, UnrecoverableError } from "bullmq";
import { TrackingKeys } from "../../../infra/tracking-keys/tracking-keys";
import {
  SendingSourcesService,
  SourceUnavailableError,
} from "../../integrations/sending-sources.service";
import {
  type MessageKind,
  SuppressionService,
} from "../../suppression/suppression.service";
import type { MessageContent } from "../content-archive";
import {
  isBulkKind,
  SEND_QUEUE,
  type SendJob,
  sendsPerSecondFor,
} from "../dispatch.constants";
import {
  DispatchRepository,
  type MessageContentRow,
  type MessageRow,
  type SnapshotRow,
} from "../dispatch.repository";
import { MessageEvents } from "../message-events";
import { prepareContent } from "../prepare-content";
import { SendRateLimiter } from "../send-rate-limiter";

const maxRateLimitWaits = 200;
const maxBulkWaitMs = 5 * 60 * 1000;
const maxCachedSnapshots = 32;
const dayMs = 24 * 60 * 60 * 1000;
const limitResetSpreadMs = 60 * 1000;

export function nextDailyLimitReset(now = new Date()) {
  return (
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + dayMs
  );
}

export function bulkWaitMs(waitMs: number, waits: number) {
  return Math.min(waitMs * 2 ** Math.min(waits, 9), maxBulkWaitMs);
}

@Processor(SEND_QUEUE, { concurrency: 10 })
export class SendProcessor extends WorkerHost {
  private readonly snapshots = new Map<string, SnapshotRow>();

  constructor(
    @Inject(DispatchRepository) private readonly repository: DispatchRepository,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
    @Inject(SendRateLimiter) private readonly limiter: SendRateLimiter,
    @Inject(MessageEvents) private readonly events: MessageEvents,
    @Inject(TrackingKeys) private readonly trackingKeys: TrackingKeys,
  ) {
    super();
  }

  async process(job: Job<SendJob>, token?: string) {
    const hinted = Boolean(job.data.sourceId && job.data.integrationType);
    if (job.data.sourceId && job.data.integrationType) {
      await this.throttle(
        job,
        token,
        job.data.sourceId,
        job.data.integrationType,
        isBulkKind(job.data.kind),
      );
    }

    const createdAt = new Date(job.data.createdAt);
    const message = await this.repository.findMessage(
      job.data.messageId,
      createdAt,
    );
    if (message?.status !== "queued") {
      return { skipped: true };
    }
    const bulk = isBulkKind(message.kind);

    const stored = await this.repository.findContent(message.id, createdAt);
    const content = stored ? await this.prepare(message, stored) : null;
    if (!content) {
      await this.fail(
        message,
        "content_missing",
        "The email content is missing.",
      );
      throw new UnrecoverableError("content_missing");
    }

    const recipients = await this.allowedRecipients(message);
    if (!recipients) {
      return { skipped: true };
    }

    const source = await this.sources
      .resolveForSend(message.workspaceId, message.sourceId)
      .catch(() => null);
    if (!source) {
      await this.fail(
        message,
        "source_missing",
        "The sending source was disconnected.",
      );
      throw new UnrecoverableError("source_missing");
    }

    if (!hinted) {
      await this.throttle(job, token, source.id, source.integrationType, bulk);
    }

    try {
      const result = await this.sources.deliver(
        message.workspaceId,
        message.sourceId,
        {
          from: {
            email: message.fromEmail,
            name: message.fromName ?? undefined,
          },
          to: recipients.to,
          cc: recipients.cc,
          bcc: recipients.bcc,
          replyTo: message.replyTo ?? undefined,
          subject: message.subject,
          html: content.html ?? undefined,
          text: content.text ?? undefined,
          headers: content.headers,
          messageId: message.rfcMessageId ?? undefined,
          idempotencyKey: message.id,
          tags: message.tags ?? undefined,
        },
      );
      const sentAt = new Date();
      await this.events.record(
        { messageId: message.id, type: "sent", occurredAt: sentAt },
        {
          internal: true,
          expectedStatus: ["queued"],
          patch: {
            providerMessageId: result.providerMessageId,
            attempts: message.attempts + 1,
            sentAt,
            toEmails: recipients.to,
            ccEmails: recipients.cc,
            bccEmails: recipients.bcc,
            suppressedEmails: recipients.suppressed,
            errorCode: null,
            errorMessage: null,
          },
        },
      );
      return { providerMessageId: result.providerMessageId };
    } catch (error) {
      if (error instanceof SourceUnavailableError) {
        await this.fail(message, error.code, error.message);
        throw new UnrecoverableError(error.code);
      }
      const failure = toIntegrationError(error);
      if (failure.code === "daily_limit_reached" && bulk) {
        await job.moveToDelayed(
          nextDailyLimitReset() +
            Math.floor(Math.random() * limitResetSpreadMs),
          token,
        );
        throw new DelayedError();
      }
      await this.repository.updateMessage(message.id, createdAt, {
        attempts: message.attempts + 1,
      });
      if (failure.code === "rate_limited") {
        await this.delay(
          job,
          token,
          (failure.retryAfterSeconds ?? 5) * 1000,
          bulk,
        );
      }
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (!failure.retryable || lastAttempt) {
        await this.fail(message, failure.code, failure.message);
        throw new UnrecoverableError(failure.code);
      }
      throw new IntegrationError(failure.code, failure.message);
    }
  }

  private async prepare(
    message: MessageRow,
    stored: MessageContentRow,
  ): Promise<MessageContent | null> {
    const snapshot = stored.snapshotId
      ? await this.snapshot(message.workspaceId, stored.snapshotId)
      : null;
    if (stored.snapshotId && !snapshot) {
      return null;
    }
    return prepareContent({
      message,
      content: {
        html: stored.html,
        text: stored.text,
        headers: stored.headers ?? {},
        snapshotId: stored.snapshotId,
        variables: stored.variables,
      },
      snapshot,
      keys: this.trackingKeys,
    });
  }

  private async snapshot(workspaceId: string, id: string) {
    const key = `${workspaceId}:${id}`;
    const cached = this.snapshots.get(key);
    if (cached) {
      return cached;
    }
    const row = await this.repository.findSnapshot(workspaceId, id);
    if (row) {
      if (this.snapshots.size >= maxCachedSnapshots) {
        const oldest = this.snapshots.keys().next().value;
        if (oldest !== undefined) {
          this.snapshots.delete(oldest);
        }
      }
      this.snapshots.set(key, row);
    }
    return row;
  }

  private async allowedRecipients(message: MessageRow) {
    const cc = message.ccEmails ?? [];
    const bcc = message.bccEmails ?? [];
    const blocked = await this.suppression.findBlocked(
      message.workspaceId,
      [...message.toEmails, ...cc, ...bcc],
      message.kind as MessageKind,
    );
    const allowed = (emails: string[]) =>
      emails.filter((email) => !blocked.has(email));
    const to = allowed(message.toEmails);
    const suppressed = [
      ...new Set([...(message.suppressedEmails ?? []), ...blocked.keys()]),
    ];
    if (to.length === 0) {
      await this.repository.updateMessage(
        message.id,
        message.createdAt,
        {
          status: "skipped",
          suppressedEmails: suppressed,
          errorCode: "suppressed",
          errorMessage: "Every recipient is on the suppression list.",
        },
        ["queued"],
      );
      return null;
    }
    return { to, cc: allowed(cc), bcc: allowed(bcc), suppressed };
  }

  private async throttle(
    job: Job<SendJob>,
    token: string | undefined,
    sourceId: string,
    integrationType: string,
    bulk: boolean,
  ) {
    const waitMs = await this.limiter.waitMs(
      sourceId,
      sendsPerSecondFor(integrationType),
    );
    if (waitMs > 0) {
      await this.delay(job, token, waitMs, bulk);
    }
  }

  private async delay(
    job: Job<SendJob>,
    token: string | undefined,
    ms: number,
    bulk: boolean,
  ) {
    const waits = typeof job.progress === "number" ? job.progress : 0;
    if (!bulk && waits >= maxRateLimitWaits) {
      throw new IntegrationError(
        "rate_limited",
        "The sending source stayed rate limited for too long.",
      );
    }
    await job.updateProgress(waits + 1);
    await job.moveToDelayed(
      Date.now() + (bulk ? bulkWaitMs(ms, waits) : ms),
      token,
    );
    throw new DelayedError();
  }

  private async fail(message: MessageRow, code: string, text: string) {
    await this.events.record(
      { messageId: message.id, type: "failed" },
      {
        internal: true,
        expectedStatus: ["queued"],
        error: { code, message: text },
      },
    );
  }
}
