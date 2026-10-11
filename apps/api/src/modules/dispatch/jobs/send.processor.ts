import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import {
  IntegrationError,
  toIntegrationError,
} from "@workspace/integration-core";
import { DelayedError, type Job, UnrecoverableError } from "bullmq";
import {
  SendingSourcesService,
  SourceUnavailableError,
} from "../../integrations/sending-sources.service";
import {
  type MessageKind,
  SuppressionService,
} from "../../suppression/suppression.service";
import {
  SEND_QUEUE,
  type SendJob,
  sendsPerSecondFor,
} from "../dispatch.constants";
import { DispatchRepository, type MessageRow } from "../dispatch.repository";
import { SendRateLimiter } from "../send-rate-limiter";

const maxRateLimitWaits = 200;

@Processor(SEND_QUEUE, { concurrency: 10 })
export class SendProcessor extends WorkerHost {
  constructor(
    @Inject(DispatchRepository) private readonly repository: DispatchRepository,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
    @Inject(SendRateLimiter) private readonly limiter: SendRateLimiter,
  ) {
    super();
  }

  async process(job: Job<SendJob>, token?: string) {
    const createdAt = new Date(job.data.createdAt);
    const message = await this.repository.findMessage(
      job.data.messageId,
      createdAt,
    );
    if (message?.status !== "queued") {
      return { skipped: true };
    }

    const content = await this.repository.findContent(message.id, createdAt);
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

    const waitMs = await this.limiter.waitMs(
      source.id,
      sendsPerSecondFor(source.integrationType),
    );
    if (waitMs > 0) {
      await this.delay(job, token, waitMs);
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
          headers: content.headers ?? undefined,
          messageId: message.rfcMessageId ?? undefined,
          idempotencyKey: message.id,
          tags: message.tags ?? undefined,
        },
      );
      await this.repository.updateMessage(
        message.id,
        createdAt,
        {
          status: "sent",
          providerMessageId: result.providerMessageId,
          attempts: message.attempts + 1,
          sentAt: new Date(),
          toEmails: recipients.to,
          ccEmails: recipients.cc,
          bccEmails: recipients.bcc,
          suppressedEmails: recipients.suppressed,
          errorCode: null,
          errorMessage: null,
        },
        ["queued"],
      );
      return { providerMessageId: result.providerMessageId };
    } catch (error) {
      if (error instanceof SourceUnavailableError) {
        await this.fail(message, error.code, error.message);
        throw new UnrecoverableError(error.code);
      }
      const failure = toIntegrationError(error);
      await this.repository.updateMessage(message.id, createdAt, {
        attempts: message.attempts + 1,
      });
      if (failure.code === "rate_limited") {
        await this.delay(job, token, (failure.retryAfterSeconds ?? 5) * 1000);
      }
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (!failure.retryable || lastAttempt) {
        await this.fail(message, failure.code, failure.message);
        throw new UnrecoverableError(failure.code);
      }
      throw new IntegrationError(failure.code, failure.message);
    }
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

  private async delay(
    job: Job<SendJob>,
    token: string | undefined,
    ms: number,
  ) {
    const waits = typeof job.progress === "number" ? job.progress : 0;
    if (waits >= maxRateLimitWaits) {
      throw new IntegrationError(
        "rate_limited",
        "The sending source stayed rate limited for too long.",
      );
    }
    await job.updateProgress(waits + 1);
    await job.moveToDelayed(Date.now() + ms, token);
    throw new DelayedError();
  }

  private async fail(message: MessageRow, code: string, text: string) {
    await this.repository.updateMessage(
      message.id,
      message.createdAt,
      { status: "failed", errorCode: code, errorMessage: text.slice(0, 2000) },
      ["queued"],
    );
  }
}
