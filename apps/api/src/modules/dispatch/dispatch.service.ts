import { createHash } from "node:crypto";
import { InjectQueue } from "@nestjs/bullmq";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ProviderEvent } from "@workspace/integration-core";
import type { Queue } from "bullmq";
import { apiError } from "../../common/api-error";
import { isUuid, uuidv7, uuidv7Date } from "../../common/uuid";
import { TrackingKeys } from "../../infra/tracking-keys/tracking-keys";
import { SendingSourcesService } from "../integrations/sending-sources.service";
import {
  type MessageKind,
  normalizeEmail,
  SuppressionService,
} from "../suppression/suppression.service";
import {
  ContentArchive,
  type MessageContent,
  type StoredContent,
} from "./content-archive";
import {
  type MessageEventType,
  maxBatchRecipients,
  SEND_QUEUE,
  type SendJob,
  sendJobOptions,
  unsubscribeMarkerHeader,
} from "./dispatch.constants";
import {
  type BatchInsertRow,
  DispatchRepository,
  type EngagementTotalsRow,
  type HourlyKindRow,
  isIdempotencyConflict,
  type MessageCursor,
} from "./dispatch.repository";
import {
  type MessageDto,
  type MessageStatus,
  messageStatuses,
  toMessageDto,
} from "./message";
import {
  MessageEvents,
  type RecordEventInput,
  type RecordEventResult,
} from "./message-events";
import { prepareContent, withoutMarker } from "./prepare-content";

export type {
  EngagementTotalsRow,
  HourlyKindRow,
} from "./dispatch.repository";
export {
  type MessageDto,
  type MessageStatus,
  messageStatuses,
  toMessageDto,
} from "./message";
export type { RecordEventInput, RecordEventResult } from "./message-events";

export type TrackedMessage = {
  id: string;
  workspaceId: string;
  email: string;
  fromName: string | null;
  contactId: string | null;
  unsubscribeListId: string | null;
  sentAt: Date | null;
  unsubscribedAt: Date | null;
};

export type RecentSender = {
  workspaceId: string;
  sourceId: string;
  integrationType: string;
};

export type SnapshotInput = {
  subject: string;
  previewText?: string | null;
  html: string;
  text?: string | null;
};

export type Snapshot = {
  id: string;
  subject: string;
  previewText: string;
  html: string;
  text: string;
  createdAt: string;
};

export type MessageLinks = {
  campaignId?: string;
  sequence?: { sequenceId: string; stepId: string; enrollmentId: string };
  tracking?: { opens: boolean; clicks: boolean };
  unsubscribe?: { listId?: string };
};

export type EnqueueInput = MessageLinks & {
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
  content?: { snapshotId: string; variables: Record<string, string> };
  contactId?: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
  idempotencyKey?: string;
};

export type BatchCommon = MessageLinks & {
  workspaceId: string;
  kind: MessageKind;
  sourceId?: string;
  from: { email: string; name?: string | null };
  replyTo?: string | null;
  snapshotId: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
};

export type BatchRecipient = {
  contactId: string;
  to: string;
  subject: string;
  variables: Record<string, string>;
  idempotencyKey: string;
};

export type BatchResult = {
  contactId: string;
  messageId: string;
  status: "queued" | "skipped";
};

export type MessagesQuery = {
  status?: string;
  sourceId?: string;
  campaignId?: string;
  sequenceId?: string;
  enrollmentId?: string;
  contactId?: string;
  cursor?: string;
  limit?: number;
};

export type MessageEventDto = {
  id: string;
  type: MessageEventType;
  occurredAt: string;
  url: string | null;
  userAgent: string | null;
  metadata: Record<string, string>;
};

const idFilters = [
  "sourceId",
  "campaignId",
  "sequenceId",
  "enrollmentId",
  "contactId",
] as const;

const maxListedEvents = 500;
const suppressedMessage = "Every recipient is on the suppression list.";

const eventByProviderEvent: Partial<
  Record<ProviderEvent["type"], MessageEventType>
> = {
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

function linkColumns(input: MessageLinks & { contactId?: string }) {
  return {
    contactId: input.contactId ?? null,
    campaignId: input.campaignId ?? null,
    sequenceId: input.sequence?.sequenceId ?? null,
    sequenceStepId: input.sequence?.stepId ?? null,
    enrollmentId: input.sequence?.enrollmentId ?? null,
    trackOpens: input.tracking?.opens ?? false,
    trackClicks: input.tracking?.clicks ?? false,
    unsubscribeListId: input.unsubscribe?.listId ?? null,
  };
}

function storedHeaders(
  headers: Record<string, string> | undefined,
  unsubscribe: boolean,
) {
  return {
    ...withoutMarker(headers ?? {}),
    ...(unsubscribe ? { [unsubscribeMarkerHeader]: "1" } : {}),
  };
}

function rfcMessageId(id: string, fromEmail: string) {
  return `<${id}@${fromEmail.split("@")[1] ?? "localhost"}>`;
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
    @Inject(MessageEvents) private readonly events: MessageEvents,
    @Inject(TrackingKeys) private readonly trackingKeys: TrackingKeys,
    @InjectQueue(SEND_QUEUE) private readonly queue: Queue<SendJob>,
  ) {}

  async createSnapshot(
    workspaceId: string,
    input: SnapshotInput,
  ): Promise<{ id: string }> {
    return this.repository.insertSnapshot({
      workspaceId,
      subject: input.subject,
      previewText: input.previewText ?? "",
      html: input.html,
      text: input.text ?? "",
    });
  }

  async getSnapshot(workspaceId: string, id: string): Promise<Snapshot | null> {
    const row = isUuid(id)
      ? await this.repository.findSnapshot(workspaceId, id)
      : null;
    return row
      ? {
          id: row.id,
          subject: row.subject,
          previewText: row.previewText,
          html: row.html,
          text: row.text,
          createdAt: row.createdAt.toISOString(),
        }
      : null;
  }

  async enqueue(input: EnqueueInput): Promise<MessageDto> {
    const fromEmail = normalizeEmail(input.from.email);
    const source = await this.resolveSource(
      input.workspaceId,
      input.sourceId,
      fromEmail,
    );
    if (input.content) {
      await this.requireSnapshot(input.workspaceId, input.content.snapshotId);
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
          rfcMessageId: rfcMessageId(id, fromEmail),
          errorCode: skipped ? "suppressed" : null,
          errorMessage: skipped ? suppressedMessage : null,
          ...linkColumns(input),
        },
        skipped
          ? null
          : {
              messageId: id,
              createdAt,
              workspaceId: input.workspaceId,
              html: input.content ? null : (input.html ?? null),
              text: input.content ? null : (input.text ?? null),
              headers: storedHeaders(
                input.headers,
                input.unsubscribe !== undefined,
              ),
              snapshotId: input.content?.snapshotId ?? null,
              variables: input.content?.variables ?? null,
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
      await this.addJobs([{ id, createdAt }], {
        kind: input.kind,
        sourceId: source.id,
        integrationType: source.integrationType,
      });
    }
    return this.require(input.workspaceId, id);
  }

  async enqueueBatch(
    common: BatchCommon,
    recipients: BatchRecipient[],
  ): Promise<BatchResult[]> {
    if (recipients.length > maxBatchRecipients) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        `Send to ${maxBatchRecipients} recipients or fewer in one batch.`,
        "recipients",
      );
    }
    if (recipients.length === 0) {
      return [];
    }
    const { workspaceId } = common;
    const fromEmail = normalizeEmail(common.from.email);
    const source = await this.resolveSource(
      workspaceId,
      common.sourceId,
      fromEmail,
    );
    await this.requireSnapshot(workspaceId, common.snapshotId);

    const keys = [...new Set(recipients.map((item) => item.idempotencyKey))];
    const earlier = await this.findEarlier(workspaceId, keys);
    const fresh = new Map<string, BatchRecipient>();
    for (const recipient of recipients) {
      if (
        !earlier.has(recipient.idempotencyKey) &&
        !fresh.has(recipient.idempotencyKey)
      ) {
        fresh.set(recipient.idempotencyKey, recipient);
      }
    }

    const blocked = await this.suppression.findBlocked(
      workspaceId,
      [...fresh.values()].map((recipient) => recipient.to),
      common.kind,
    );
    const createdAt = new Date();
    const links = linkColumns(common);
    const headers = storedHeaders(
      common.headers,
      common.unsubscribe !== undefined,
    );
    const fromName = common.from.name?.trim() || null;
    const replyTo = common.replyTo ? normalizeEmail(common.replyTo) : null;
    const commonHash = createHash("sha256")
      .update(JSON.stringify(common))
      .digest("hex");
    const rows: BatchInsertRow[] = [...fresh.values()].map((recipient) => {
      const id = uuidv7(createdAt);
      const to = normalizeEmail(recipient.to);
      const skipped = blocked.has(to);
      return {
        message: {
          id,
          createdAt,
          workspaceId,
          sourceId: source.id,
          kind: common.kind,
          status: skipped ? "skipped" : "queued",
          fromEmail,
          fromName,
          toEmails: [to],
          ccEmails: [],
          bccEmails: [],
          suppressedEmails: skipped ? [to] : [],
          replyTo,
          subject: recipient.subject,
          tags: common.tags,
          rfcMessageId: rfcMessageId(id, fromEmail),
          errorCode: skipped ? "suppressed" : null,
          errorMessage: skipped ? suppressedMessage : null,
          ...links,
          contactId: recipient.contactId,
        },
        content: skipped
          ? null
          : {
              messageId: id,
              createdAt,
              workspaceId,
              html: null,
              text: null,
              headers,
              snapshotId: common.snapshotId,
              variables: recipient.variables,
            },
        idempotency: { key: recipient.idempotencyKey, requestHash: commonHash },
      };
    });

    const inserted = await this.repository.insertBatch(rows);
    const accepted = new Map<
      string,
      { messageId: string; status: "queued" | "skipped" }
    >();
    const jobs: { id: string; createdAt: Date }[] = [];
    const lost: string[] = [];
    for (const row of rows) {
      if (!inserted.has(row.message.id)) {
        lost.push(row.idempotency.key);
        continue;
      }
      const status = row.message.status === "skipped" ? "skipped" : "queued";
      accepted.set(row.idempotency.key, { messageId: row.message.id, status });
      if (status === "queued") {
        jobs.push({ id: row.message.id, createdAt });
      }
    }
    const raced = await this.findEarlier(workspaceId, lost);
    for (const [key, value] of [...earlier, ...raced]) {
      accepted.set(key, { messageId: value.messageId, status: value.status });
      const queuedAt = value.waiting ? uuidv7Date(value.messageId) : null;
      if (queuedAt) {
        jobs.push({ id: value.messageId, createdAt: queuedAt });
      }
    }
    await this.addJobs(jobs, {
      kind: common.kind,
      sourceId: source.id,
      integrationType: source.integrationType,
    });

    return recipients.map((recipient) => {
      const result = accepted.get(recipient.idempotencyKey);
      if (!result) {
        throw new Error("A batch recipient was not accepted.");
      }
      return { contactId: recipient.contactId, ...result };
    });
  }

  async get(workspaceId: string, id: string) {
    const message = await this.require(workspaceId, id);
    const createdAt = new Date(message.createdAt);
    const row = await this.repository.findContent(id, createdAt);
    const stored: StoredContent | null = row
      ? {
          html: row.html,
          text: row.text,
          headers: row.headers ?? {},
          snapshotId: row.snapshotId,
          variables: row.variables,
        }
      : await this.archive
          .getStored(workspaceId, id, createdAt)
          .catch(() => null);
    return {
      ...message,
      content: stored ? await this.viewContent(workspaceId, id, stored) : null,
    };
  }

  async list(workspaceId: string, query: MessagesQuery) {
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 100);
    for (const field of idFilters) {
      const value = query[field];
      if (value && !isUuid(value)) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "validation",
          `${field} is not a valid id.`,
          field,
        );
      }
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
      campaignId: query.campaignId,
      sequenceId: query.sequenceId,
      enrollmentId: query.enrollmentId,
      contactId: query.contactId,
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

  recordEvent(input: RecordEventInput): Promise<RecordEventResult | null> {
    return this.events.record(input);
  }

  async countByStatus(
    workspaceId: string,
    scope: {
      campaignId?: string;
      sequenceId?: string;
      sourceId?: string;
      since?: Date;
    },
  ): Promise<Record<MessageStatus, number>> {
    if (!scope.campaignId && !scope.sequenceId) {
      throw new Error("countByStatus needs a campaign or a sequence.");
    }
    const counts = Object.fromEntries(
      messageStatuses.map((status) => [status, 0]),
    ) as Record<MessageStatus, number>;
    for (const row of await this.repository.countByStatus(workspaceId, scope)) {
      counts[row.status as MessageStatus] = row.count;
    }
    return counts;
  }

  engagementTotals(
    workspaceId: string,
    window: { from: Date; split: Date; to: Date },
  ): Promise<EngagementTotalsRow[]> {
    return this.repository.engagementTotals(workspaceId, window);
  }

  hourlyByKind(
    workspaceId: string,
    window: { from: Date; to: Date; timezone: string; kinds: string[] },
  ): Promise<HourlyKindRow[]> {
    return this.repository.hourlyByKind(workspaceId, window);
  }

  async recentSenders(input: {
    since: Date;
    kinds: MessageKind[];
    workspaceIds?: string[];
    accepts: (integrationType: string) => boolean;
  }): Promise<RecentSender[]> {
    const connected = (
      await this.repository.listConnectedSources(input.workspaceIds)
    ).filter((source) => input.accepts(source.integrationType));
    const types = new Map(
      connected.map((source) => [source.sourceId, source.integrationType]),
    );
    const active = await this.repository.filterRecentSenders(
      connected,
      input.since,
      input.kinds,
    );
    return active.map((source) => ({
      ...source,
      integrationType: types.get(source.sourceId) ?? "",
    }));
  }

  hasMessages(workspaceId: string): Promise<boolean> {
    return this.repository.hasMessages(workspaceId);
  }

  async findTracked(id: string): Promise<TrackedMessage | null> {
    const createdAt = uuidv7Date(id);
    const row = createdAt
      ? await this.repository.findMessage(id, createdAt)
      : null;
    const email = row?.toEmails[0];
    if (!row || !email) {
      return null;
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      email,
      fromName: row.fromName,
      contactId: row.contactId,
      unsubscribeListId: row.unsubscribeListId,
      sentAt: row.sentAt,
      unsubscribedAt: row.unsubscribedAt,
    };
  }

  async findByRfcMessageId(
    workspaceId: string,
    rfcMessageId: string,
  ): Promise<MessageDto | null> {
    const inner = rfcMessageId.trim().replace(/^<+/, "").replace(/>+$/, "");
    const id = inner.split("@")[0] ?? "";
    const createdAt = uuidv7Date(id);
    const row = createdAt
      ? await this.repository.findListedMessage(workspaceId, id, createdAt)
      : id !== "" && inner.includes("@")
        ? await this.repository.findListedByAssignedId(
            workspaceId,
            `<${inner}>`,
            id,
          )
        : null;
    return row ? toMessageDto(row) : null;
  }

  async listEvents(
    workspaceId: string,
    messageId: string,
  ): Promise<MessageEventDto[]> {
    const createdAt = uuidv7Date(messageId);
    if (!createdAt) {
      return [];
    }
    const rows = await this.repository.listEvents(
      workspaceId,
      messageId,
      createdAt,
      maxListedEvents,
    );
    return rows.map((row) => ({
      id: row.id,
      type: row.type as MessageEventType,
      occurredAt: row.createdAt.toISOString(),
      url: row.url,
      userAgent: row.userAgent,
      metadata: row.metadata ?? {},
    }));
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
    const type = eventByProviderEvent[event.type];
    if (type) {
      const problem =
        type === "bounced" || type === "complained" || type === "failed";
      await this.events.record(
        { messageId: message.id, type, occurredAt: event.occurredAt },
        problem
          ? {
              error: {
                code:
                  event.type === "suppressed"
                    ? "suppressed_by_provider"
                    : event.type,
                message:
                  event.bounce?.message ??
                  event.reason ??
                  "The provider reported a problem with this email.",
              },
            }
          : {},
      );
    } else {
      await this.repository.updateMessage(message.id, message.createdAt, {
        lastEventAt: event.occurredAt,
      });
    }
    return {
      messageId: message.id,
      recipients:
        event.recipients.length > 0
          ? event.recipients.map(normalizeEmail)
          : message.toEmails,
    };
  }

  private async resolveSource(
    workspaceId: string,
    sourceId: string | undefined,
    fromEmail: string,
  ) {
    const source = await this.sources.resolveForSend(workspaceId, sourceId);
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
    if (source.email && normalizeEmail(source.email) !== fromEmail) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        `This mailbox can only send as ${source.email}.`,
        "from",
      );
    }
    return source;
  }

  private async requireSnapshot(workspaceId: string, id: string) {
    const snapshot = isUuid(id)
      ? await this.repository.findSnapshot(workspaceId, id)
      : null;
    if (!snapshot) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "not_found",
        "This content snapshot does not exist in the workspace.",
        "content",
      );
    }
    return snapshot;
  }

  private async findEarlier(workspaceId: string, keys: string[]) {
    const rows = await this.repository.findIdempotencyKeys(workspaceId, keys);
    return new Map(
      rows.map((row) => [
        row.key,
        {
          messageId: row.messageId,
          status:
            row.status === "skipped"
              ? ("skipped" as const)
              : ("queued" as const),
          waiting: row.status === "queued",
        },
      ]),
    );
  }

  private async addJobs(
    messages: { id: string; createdAt: Date }[],
    hint: { kind: string; sourceId: string; integrationType: string },
  ) {
    const [only] = messages;
    if (!only) {
      return;
    }
    const data = (message: { id: string; createdAt: Date }): SendJob => ({
      messageId: message.id,
      createdAt: message.createdAt.toISOString(),
      ...hint,
    });
    if (messages.length === 1) {
      await this.queue.add("send", data(only), {
        ...sendJobOptions,
        jobId: only.id,
      });
      return;
    }
    await this.queue.addBulk(
      messages.map((message) => ({
        name: "send",
        data: data(message),
        opts: { ...sendJobOptions, jobId: message.id },
      })),
    );
  }

  private async viewContent(
    workspaceId: string,
    messageId: string,
    stored: StoredContent,
  ): Promise<MessageContent> {
    const snapshot = stored.snapshotId
      ? await this.repository.findSnapshot(workspaceId, stored.snapshotId)
      : null;
    return prepareContent({
      message: {
        id: messageId,
        trackOpens: false,
        trackClicks: false,
        unsubscribeListId: null,
      },
      content: stored,
      snapshot,
      keys: this.trackingKeys,
      preview: true,
    });
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
    if (row?.status === "queued") {
      await this.addJobs([{ id: row.id, createdAt: row.createdAt }], {
        kind: row.kind,
        sourceId: row.sourceId,
        integrationType: row.integrationType,
      });
    }
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
