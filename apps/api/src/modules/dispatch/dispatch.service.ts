import { createHash } from "node:crypto";
import { InjectQueue } from "@nestjs/bullmq";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ProviderEvent } from "@workspace/integration-core";
import type { Queue } from "bullmq";
import { apiError } from "../../common/api-error";
import { isUuid, uuidv7, uuidv7Date } from "../../common/uuid";
import { SendingSourcesService } from "../integrations/sending-sources.service";
import {
  type MessageKind,
  normalizeEmail,
  SuppressionService,
} from "../suppression/suppression.service";
import { ContentArchive, type MessageContent } from "./content-archive";
import { SEND_QUEUE, type SendJob, sendJobOptions } from "./dispatch.constants";
import {
  DispatchRepository,
  isIdempotencyConflict,
  type MessageCursor,
  type MessageListRow,
} from "./dispatch.repository";

export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "delayed"
  | "bounced"
  | "complained"
  | "failed"
  | "skipped";

export const messageStatuses: MessageStatus[] = [
  "queued",
  "sent",
  "delivered",
  "delayed",
  "bounced",
  "complained",
  "failed",
  "skipped",
];

export type EnqueueInput = {
  workspaceId: string;
  kind: MessageKind;
  sourceId?: string;
  from: { email: string; name?: string | null };
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string | null;
  subject: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
  idempotencyKey?: string;
};

export type MessageDto = {
  id: string;
  createdAt: string;
  kind: string;
  status: MessageStatus;
  sourceId: string;
  sourceName: string;
  integrationType: string;
  from: { email: string; name: string | null };
  to: string[];
  cc: string[];
  bcc: string[];
  suppressed: string[];
  subject: string;
  tags: Record<string, string>;
  error: { code: string; message: string } | null;
  attempts: number;
  sentAt: string | null;
  lastEventAt: string | null;
};

export type MessagesQuery = {
  status?: string;
  sourceId?: string;
  cursor?: string;
  limit?: number;
};

const statusRank: Record<MessageStatus, number> = {
  queued: 0,
  skipped: 0,
  sent: 1,
  delayed: 2,
  delivered: 3,
  failed: 4,
  bounced: 5,
  complained: 6,
};

const statusByEvent: Partial<Record<ProviderEvent["type"], MessageStatus>> = {
  delivered: "delivered",
  delayed: "delayed",
  bounced: "bounced",
  complained: "complained",
  failed: "failed",
  suppressed: "failed",
};

function encodeCursor(cursor: MessageCursor) {
  return Buffer.from(
    `${cursor.createdAt.toISOString()}|${cursor.id}`,
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string): MessageCursor | null {
  const [createdAt, id] = Buffer.from(value, "base64url")
    .toString("utf8")
    .split("|");
  const date = createdAt ? new Date(createdAt) : null;
  if (!date || Number.isNaN(date.getTime()) || !id || !isUuid(id)) {
    return null;
  }
  return { createdAt: date, id };
}

function unique(emails: string[] | undefined) {
  return [...new Set((emails ?? []).map(normalizeEmail))];
}

export function toMessageDto(row: MessageListRow): MessageDto {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    kind: row.kind,
    status: row.status as MessageStatus,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    integrationType: row.integrationType,
    from: { email: row.fromEmail, name: row.fromName },
    to: row.toEmails,
    cc: row.ccEmails ?? [],
    bcc: row.bccEmails ?? [],
    suppressed: row.suppressedEmails ?? [],
    subject: row.subject,
    tags: row.tags ?? {},
    error: row.errorCode
      ? { code: row.errorCode, message: row.errorMessage ?? "" }
      : null,
    attempts: row.attempts,
    sentAt: row.sentAt?.toISOString() ?? null,
    lastEventAt: row.lastEventAt?.toISOString() ?? null,
  };
}

@Injectable()
export class DispatchService {
  constructor(
    @Inject(DispatchRepository) private readonly repository: DispatchRepository,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
    @Inject(ContentArchive) private readonly archive: ContentArchive,
    @InjectQueue(SEND_QUEUE) private readonly queue: Queue<SendJob>,
  ) {}

  async enqueue(input: EnqueueInput): Promise<MessageDto> {
    const source = await this.sources.resolveForSend(
      input.workspaceId,
      input.sourceId,
    );
    if (source.pausedAt || source.status === "needs_attention") {
      throw apiError(
        HttpStatus.CONFLICT,
        "source_unavailable",
        source.pausedAt
          ? `Sending through ${source.name} is paused. Resume it or choose another source.`
          : `${source.name} needs attention before it can send. Fix it on the Integrations page.`,
        "sourceId",
      );
    }
    const fromEmail = normalizeEmail(input.from.email);
    if (source.email && normalizeEmail(source.email) !== fromEmail) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        `This mailbox can only send as ${source.email}.`,
        "from",
      );
    }

    const requestHash = createHash("sha256")
      .update(JSON.stringify({ ...input, idempotencyKey: undefined }))
      .digest("hex");
    if (input.idempotencyKey) {
      const replay = await this.replay(
        input.workspaceId,
        input.idempotencyKey,
        requestHash,
      );
      if (replay) {
        return replay;
      }
    }

    const to = unique(input.to);
    const cc = unique(input.cc).filter((email) => !to.includes(email));
    const bcc = unique(input.bcc).filter(
      (email) => !to.includes(email) && !cc.includes(email),
    );
    const blocked = await this.suppression.findBlocked(
      input.workspaceId,
      [...to, ...cc, ...bcc],
      input.kind,
    );
    const allowed = (emails: string[]) =>
      emails.filter((email) => !blocked.has(email));
    const remaining = allowed(to);
    const skipped = remaining.length === 0;

    const createdAt = new Date();
    const id = uuidv7(createdAt);
    try {
      await this.repository.insertMessage(
        {
          id,
          createdAt,
          workspaceId: input.workspaceId,
          sourceId: source.id,
          kind: input.kind,
          status: skipped ? "skipped" : "queued",
          fromEmail,
          fromName: input.from.name?.trim() || null,
          toEmails: skipped ? to : remaining,
          ccEmails: allowed(cc),
          bccEmails: allowed(bcc),
          suppressedEmails: [...blocked.keys()],
          replyTo: input.replyTo ? normalizeEmail(input.replyTo) : null,
          subject: input.subject,
          tags: input.tags,
          rfcMessageId: `<${id}@${fromEmail.split("@")[1] ?? "localhost"}>`,
          errorCode: skipped ? "suppressed" : null,
          errorMessage: skipped
            ? "Every recipient is on the suppression list."
            : null,
        },
        skipped
          ? null
          : {
              messageId: id,
              createdAt,
              workspaceId: input.workspaceId,
              html: input.html ?? null,
              text: input.text ?? null,
              headers: input.headers ?? {},
            },
        input.idempotencyKey
          ? { key: input.idempotencyKey, requestHash }
          : null,
      );
    } catch (error) {
      if (input.idempotencyKey && isIdempotencyConflict(error)) {
        const replay = await this.replay(
          input.workspaceId,
          input.idempotencyKey,
          requestHash,
        );
        if (replay) {
          return replay;
        }
      }
      throw error;
    }

    if (!skipped) {
      await this.queue.add(
        "send",
        { messageId: id, createdAt: createdAt.toISOString() },
        { ...sendJobOptions, jobId: id },
      );
    }
    return this.require(input.workspaceId, id);
  }

  async get(workspaceId: string, id: string) {
    const message = await this.require(workspaceId, id);
    const createdAt = new Date(message.createdAt);
    const stored = await this.repository.findContent(id, createdAt);
    const content: MessageContent | null = stored
      ? {
          html: stored.html,
          text: stored.text,
          headers: stored.headers ?? {},
        }
      : await this.archive.get(workspaceId, id, createdAt).catch(() => null);
    return { ...message, content };
  }

  async list(workspaceId: string, query: MessagesQuery) {
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 100);
    if (query.sourceId && !isUuid(query.sourceId)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "sourceId is not a valid id.",
        "sourceId",
      );
    }
    if (
      query.status &&
      !messageStatuses.includes(query.status as MessageStatus)
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        `status must be one of: ${messageStatuses.join(", ")}.`,
        "status",
      );
    }
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    if (cursor === null) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "The cursor is not valid. Start again from the first page.",
        "cursor",
      );
    }
    const rows = await this.repository.listMessages({
      workspaceId,
      status: query.status,
      sourceId: query.sourceId,
      cursor,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      emails: page.map(toMessageDto),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async applyProviderEvent(sourceId: string, event: ProviderEvent) {
    if (!event.providerMessageId) {
      return null;
    }
    const message = await this.repository.findByProviderMessageId(
      sourceId,
      event.providerMessageId,
    );
    if (!message) {
      return null;
    }
    const next = statusByEvent[event.type];
    const current = message.status as MessageStatus;
    const advance =
      next !== undefined && statusRank[next] > statusRank[current];
    const problem =
      next === "bounced" || next === "complained" || next === "failed";
    await this.repository.updateMessage(message.id, message.createdAt, {
      lastEventAt: event.occurredAt,
      ...(advance ? { status: next } : {}),
      ...(advance && problem
        ? {
            errorCode:
              event.type === "suppressed"
                ? "suppressed_by_provider"
                : event.type,
            errorMessage: (
              event.bounce?.message ??
              event.reason ??
              "The provider reported a problem with this email."
            ).slice(0, 2000),
          }
        : {}),
    });
    return {
      messageId: message.id,
      recipients:
        event.recipients.length > 0
          ? event.recipients.map(normalizeEmail)
          : message.toEmails,
    };
  }

  private async replay(workspaceId: string, key: string, requestHash: string) {
    const existing = await this.repository.findIdempotencyKey(workspaceId, key);
    if (!existing) {
      return null;
    }
    if (existing.requestHash !== requestHash) {
      throw apiError(
        HttpStatus.CONFLICT,
        "idempotency_conflict",
        "This Idempotency-Key was already used with a different request. Use a new key.",
      );
    }
    const row = await this.repository.findListedMessage(
      workspaceId,
      existing.messageId,
      existing.messageCreatedAt,
    );
    return row ? toMessageDto(row) : null;
  }

  private async require(workspaceId: string, id: string) {
    const createdAt = uuidv7Date(id);
    const row = createdAt
      ? await this.repository.findListedMessage(workspaceId, id, createdAt)
      : null;
    if (!row) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "not_found",
        "This email does not exist in the workspace.",
      );
    }
    return toMessageDto(row);
  }
}
