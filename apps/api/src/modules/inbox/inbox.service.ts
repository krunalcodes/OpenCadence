import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import {
  clampLimit,
  decodeKeysetCursor,
  encodeKeysetCursor,
} from "../../common/pagination/keyset-cursor";
import { isUuid } from "../../common/uuid";
import { CampaignsService } from "../campaigns/campaigns.service";
import { DispatchService } from "../dispatch/dispatch.service";
import {
  type SendingSourceDto,
  SendingSourcesService,
} from "../integrations/sending-sources.service";
import { SequencesService } from "../sequences/sequences.service";
import { SuppressionService } from "../suppression/suppression.service";
import {
  defaultThreadLimit,
  maxReferencesSent,
  maxReplyHtmlLength,
  maxReplyTextLength,
  maxSearchLength,
  maxThreadLimit,
  maxThreadMessages,
  type ThreadStatus,
} from "./inbox.constants";
import {
  type InboxMessageRow,
  InboxRepository,
  type ThreadRow,
} from "./inbox.repository";
import {
  isRfcMessageId,
  isSyntheticMessageId,
  replySubject,
  safeContent,
  snippetOf,
} from "./reply-text";

export type ThreadOrigin = {
  type: "campaign" | "sequence";
  id: string;
  name: string;
};

export type Thread = {
  id: string;
  contact: { id: string | null; email: string; name: string | null };
  subject: string;
  snippet: string;
  status: ThreadStatus;
  unread: boolean;
  source: { id: string; name: string; email: string | null };
  origin: ThreadOrigin | null;
  messageCount: number;
  lastDirection: "inbound" | "outbound";
  lastMessageAt: string;
};

export type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  from: { email: string; name: string | null };
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  occurredAt: string;
  status: string | null;
};

export type ThreadsQuery = {
  status?: string;
  unread?: string;
  sourceId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
};

type Lookups = {
  sources: Map<string, SendingSourceDto>;
  origins: Map<string, ThreadOrigin | null>;
};

const statusFilters = ["open", "closed", "all"];

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This conversation does not exist in the workspace.",
  );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function flag(value: string | undefined, field: string) {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw validation(`${field} must be true or false.`, field);
}

function toMessage(row: InboxMessageRow, status: string | null): InboxMessage {
  return {
    id: row.id,
    direction: row.direction as InboxMessage["direction"],
    from: { email: row.fromEmail, name: row.fromName },
    to: row.toEmails,
    subject: row.subject,
    text: row.text,
    html: row.html,
    occurredAt: row.occurredAt.toISOString(),
    status,
  };
}

@Injectable()
export class InboxService {
  constructor(
    @Inject(InboxRepository) private readonly repository: InboxRepository,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(SequencesService) private readonly sequences: SequencesService,
  ) {}

  async list(workspaceId: string, query: ThreadsQuery) {
    const status = query.status || "open";
    if (!statusFilters.includes(status)) {
      throw validation("status must be open, closed or all.", "status");
    }
    const unread = flag(query.unread, "unread");
    if (query.sourceId && !isUuid(query.sourceId)) {
      throw validation("sourceId is not a valid id.", "sourceId");
    }
    const search = query.search?.trim() ?? "";
    if (search.length > maxSearchLength) {
      throw validation(
        `Search with ${maxSearchLength} characters or fewer.`,
        "search",
      );
    }
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : undefined;
    if (cursor === null) {
      throw validation(
        "The cursor is not valid. Start again from the first page.",
        "cursor",
      );
    }
    const limit = clampLimit(query.limit, defaultThreadLimit, maxThreadLimit);
    const [rows, unreadCount] = await Promise.all([
      this.repository.listThreads(workspaceId, {
        status: status === "all" ? undefined : (status as ThreadStatus),
        unread,
        sourceId: query.sourceId || undefined,
        search: search || undefined,
        cursor,
        limit: limit + 1,
      }),
      this.repository.countUnread(workspaceId),
    ]);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const lookups = await this.lookups(workspaceId, page);
    return {
      items: page.map((row) => this.toThread(row, lookups)),
      nextCursor:
        rows.length > limit && last
          ? encodeKeysetCursor({ at: last.cursorAt, id: last.id })
          : null,
      unreadCount,
    };
  }

  async summary(workspaceId: string) {
    return { unreadCount: await this.repository.countUnread(workspaceId) };
  }

  async get(
    workspaceId: string,
    id: string,
  ): Promise<Thread & { messages: InboxMessage[] }> {
    const row = await this.require(workspaceId, id);
    const [lookups, original, stored] = await Promise.all([
      this.lookups(workspaceId, [row]),
      this.original(workspaceId, row),
      this.repository.listMessages(workspaceId, row.id, maxThreadMessages),
    ]);
    const messages = await Promise.all(
      stored.map(async (message) =>
        toMessage(
          message,
          message.direction === "outbound" && message.rfcMessageId
            ? ((
                await this.dispatch.findByRfcMessageId(
                  workspaceId,
                  message.rfcMessageId,
                )
              )?.status ?? null)
            : null,
        ),
      ),
    );
    return {
      ...this.toThread(row, lookups),
      messages: original ? [original, ...messages] : messages,
    };
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { status?: ThreadStatus; unread?: boolean },
  ): Promise<Thread> {
    const row = isUuid(id)
      ? await this.repository.updateThread(workspaceId, id, patch)
      : null;
    if (!row) {
      throw notFound();
    }
    return this.toThread(row, await this.lookups(workspaceId, [row]));
  }

  async reply(
    context: WorkspaceAuthContext,
    id: string,
    input: unknown,
  ): Promise<InboxMessage> {
    const { workspaceId } = context;
    const thread = await this.require(workspaceId, id);
    const body = record(input);
    if (typeof body.text !== "string" || body.text.trim() === "") {
      throw validation("Write the reply before sending it.", "text");
    }
    if (body.text.length > maxReplyTextLength) {
      throw validation(
        `Keep the reply to ${maxReplyTextLength} characters or fewer.`,
        "text",
      );
    }
    if (
      body.html !== undefined &&
      body.html !== null &&
      typeof body.html !== "string"
    ) {
      throw validation("html must be text.", "html");
    }
    if (
      typeof body.html === "string" &&
      body.html.length > maxReplyHtmlLength
    ) {
      throw validation(
        `Keep the formatted reply to ${maxReplyHtmlLength} characters or fewer.`,
        "html",
      );
    }
    const content = safeContent({ text: body.text, html: body.html });

    const blocked = await this.suppression.findBlocked(
      workspaceId,
      [thread.contactEmail],
      "reply",
    );
    if (blocked.size > 0) {
      throw this.suppressed(thread.contactEmail);
    }
    const { sources } = await this.sources.list(workspaceId);
    const source = sources.find((item) => item.id === thread.sourceId);
    if (!source) {
      throw apiError(
        HttpStatus.CONFLICT,
        "source_unavailable",
        "The mailbox this conversation came through was disconnected. Connect it again to reply.",
        "sourceId",
      );
    }
    const root = thread.rootRfcMessageId
      ? await this.dispatch.findByRfcMessageId(
          workspaceId,
          thread.rootRfcMessageId,
        )
      : null;
    const fromEmail = source.email ?? root?.from.email;
    if (!fromEmail) {
      throw apiError(
        HttpStatus.CONFLICT,
        "source_unavailable",
        "This conversation has no address to reply from.",
        "sourceId",
      );
    }
    const known = (
      await this.repository.listRecentRfcIds(
        workspaceId,
        thread.id,
        maxReferencesSent,
      )
    ).filter(
      (item) =>
        isRfcMessageId(item.rfcMessageId) &&
        !isSyntheticMessageId(item.rfcMessageId),
    );
    const inReplyTo =
      known.findLast((item) => item.direction === "inbound")?.rfcMessageId ??
      thread.rootRfcMessageId;
    const references = [
      ...new Set(
        [
          thread.rootRfcMessageId,
          ...known.map((item) => item.rfcMessageId),
        ].filter((value): value is string => Boolean(value)),
      ),
    ];
    const subject = replySubject(thread.subject);

    const sent = await this.dispatch.enqueue({
      workspaceId,
      kind: "reply",
      sourceId: source.id,
      from: { email: fromEmail, name: root?.from.name ?? null },
      to: [thread.contactEmail],
      subject,
      text: content.text,
      html: content.html,
      headers: inReplyTo
        ? { "In-Reply-To": inReplyTo, References: references.join(" ") }
        : undefined,
      contactId: thread.contactId ?? undefined,
    });
    if (sent.status === "skipped") {
      throw this.suppressed(thread.contactEmail);
    }
    const row = await this.repository.storeOutbound({
      workspaceId,
      threadId: thread.id,
      rfcMessageId: sent.rfcMessageId,
      inReplyTo: inReplyTo ?? null,
      fromEmail: sent.from.email,
      fromName: sent.from.name,
      toEmails: sent.to,
      subject,
      text: content.text,
      html: content.html,
      snippet: snippetOf(content.text ?? ""),
      outboundMessageId: sent.id,
      sentByUserId: context.method === "session" ? context.userId : null,
      occurredAt: new Date(sent.createdAt),
    });
    return toMessage(row, sent.status);
  }

  private suppressed(email: string) {
    return apiError(
      HttpStatus.CONFLICT,
      "recipient_suppressed",
      `${email} is on the suppression list because of a bounce, a complaint or a manual block, so the reply was not sent.`,
      "text",
    );
  }

  private async require(workspaceId: string, id: string) {
    const row = isUuid(id)
      ? await this.repository.findThread(workspaceId, id)
      : null;
    if (!row) {
      throw notFound();
    }
    return row;
  }

  private async original(
    workspaceId: string,
    thread: ThreadRow,
  ): Promise<InboxMessage | null> {
    if (!thread.rootMessageId) {
      return null;
    }
    const message = await this.dispatch
      .get(workspaceId, thread.rootMessageId)
      .catch(() => null);
    if (!message) {
      return null;
    }
    const content = safeContent({
      text: message.content?.text,
      html: message.content?.html,
    });
    return {
      id: message.id,
      direction: "outbound",
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: content.text,
      html: content.html,
      occurredAt: message.sentAt ?? message.createdAt,
      status: message.status,
    };
  }

  private async lookups(
    workspaceId: string,
    rows: ThreadRow[],
  ): Promise<Lookups> {
    const origins = new Map<string, ThreadOrigin | null>();
    if (rows.length === 0) {
      return { sources: new Map(), origins };
    }
    const wanted = new Map<string, "campaign" | "sequence">();
    for (const row of rows) {
      if (row.campaignId) {
        wanted.set(row.campaignId, "campaign");
      } else if (row.sequenceId) {
        wanted.set(row.sequenceId, "sequence");
      }
    }
    const [{ sources }] = await Promise.all([
      this.sources.list(workspaceId),
      ...[...wanted].map(async ([id, type]) => {
        const found = await (type === "campaign"
          ? this.campaigns.get(workspaceId, id)
          : this.sequences.get(workspaceId, id)
        ).catch(() => null);
        origins.set(id, found ? { type, id, name: found.name } : null);
      }),
    ]);
    return {
      sources: new Map(sources.map((source) => [source.id, source])),
      origins,
    };
  }

  private toThread(row: ThreadRow, lookups: Lookups): Thread {
    const source = lookups.sources.get(row.sourceId);
    return {
      id: row.id,
      contact: {
        id: row.contactId,
        email: row.contactEmail,
        name: row.contactName,
      },
      subject: row.subject,
      snippet: row.snippet,
      status: row.status as ThreadStatus,
      unread: row.unread,
      source: {
        id: row.sourceId,
        name: source?.name ?? "",
        email: source?.email ?? null,
      },
      origin:
        lookups.origins.get(row.campaignId ?? row.sequenceId ?? "") ?? null,
      messageCount: row.messageCount,
      lastDirection: row.lastDirection as Thread["lastDirection"],
      lastMessageAt: row.lastMessageAt.toISOString(),
    };
  }
}
