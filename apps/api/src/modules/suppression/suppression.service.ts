import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import {
  type SuppressionCursor,
  SuppressionRepository,
} from "./suppression.repository";

export type SuppressionReason =
  | "unsubscribed"
  | "bounced"
  | "complained"
  | "manual";
export type SuppressionOrigin = "user" | "api" | "webhook" | "import";
export const messageKinds = [
  "transactional",
  "campaign",
  "sequence",
  "reply",
  "test",
] as const;
export type MessageKind = (typeof messageKinds)[number];

const kindsPastUnsubscribe: MessageKind[] = ["transactional", "reply", "test"];

export type Suppression = {
  id: string;
  email: string;
  reason: SuppressionReason;
  origin: SuppressionOrigin;
  sourceId: string | null;
  note: string | null;
  createdAt: string;
};

export type SuppressionActor = {
  workspaceId: string;
  userId: string | null;
  origin: "user" | "api";
};

export type SuppressionListInput = {
  reason?: string;
  search?: string;
  cursor?: string;
  limit?: number;
};

export type SuppressionRecord = {
  workspaceId: string;
  email: string;
  reason: SuppressionReason;
  origin: SuppressionOrigin;
  sourceId?: string | null;
  messageId?: string | null;
  note?: string | null;
  createdByUserId?: string | null;
};

const reasons: SuppressionReason[] = [
  "unsubscribed",
  "bounced",
  "complained",
  "manual",
];
const manualReasons: SuppressionReason[] = ["manual", "unsubscribed"];
const deliverabilityReasons: SuppressionReason[] = [
  "bounced",
  "complained",
  "manual",
];
const severity: Record<SuppressionReason, number> = {
  complained: 4,
  bounced: 3,
  manual: 2,
  unsubscribed: 1,
};

const maxEmails = 1000;
const maxEmailLength = 320;
const maxNoteLength = 500;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cursorTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return email.length <= maxEmailLength && emailPattern.test(email);
}

function isReason(value: unknown): value is SuppressionReason {
  return reasons.includes(value as SuppressionReason);
}

function encodeCursor(cursor: SuppressionCursor) {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

function decodeCursor(value: string): SuppressionCursor | null {
  const [createdAt, id] = Buffer.from(value, "base64url")
    .toString("utf8")
    .split("|");
  if (
    !createdAt ||
    !cursorTimePattern.test(createdAt) ||
    Number.isNaN(Date.parse(createdAt)) ||
    !id ||
    !uuidPattern.test(id)
  ) {
    return null;
  }
  return { createdAt, id };
}

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

@Injectable()
export class SuppressionService {
  constructor(
    @Inject(SuppressionRepository)
    private readonly repository: SuppressionRepository,
  ) {}

  async findBlocked(
    workspaceId: string,
    emails: string[],
    kind: MessageKind,
  ): Promise<Map<string, SuppressionReason>> {
    const blocked = new Map<string, SuppressionReason>();
    const unique = [...new Set(emails.map(normalizeEmail))].filter(Boolean);
    if (unique.length === 0) {
      return blocked;
    }
    const rows = await this.repository.findByEmails(
      workspaceId,
      unique,
      kindsPastUnsubscribe.includes(kind) ? deliverabilityReasons : undefined,
    );
    for (const row of rows) {
      if (!isReason(row.reason)) {
        continue;
      }
      const current = blocked.get(row.email);
      if (!current || severity[row.reason] > severity[current]) {
        blocked.set(row.email, row.reason);
      }
    }
    return blocked;
  }

  async record(input: SuppressionRecord): Promise<{ created: boolean }> {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
      throw validation(
        `"${input.email}" is not a valid email address.`,
        "email",
      );
    }
    const inserted = await this.repository.insertIgnoringExisting([
      {
        workspaceId: input.workspaceId,
        email,
        reason: input.reason,
        origin: input.origin,
        sourceId: input.sourceId ?? null,
        messageId: input.messageId ?? null,
        note: input.note?.slice(0, maxNoteLength) ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
    ]);
    return { created: inserted > 0 };
  }

  async list(workspaceId: string, input: SuppressionListInput) {
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 100);
    if (input.reason !== undefined && !isReason(input.reason)) {
      throw validation(
        "reason must be one of unsubscribed, bounced, complained or manual.",
        "reason",
      );
    }
    const search = input.search ? normalizeEmail(input.search) : "";
    if (search.length > maxEmailLength) {
      throw validation(
        `Search with ${maxEmailLength} characters or fewer.`,
        "search",
      );
    }
    const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
    if (cursor === null) {
      throw validation(
        "The cursor is not valid. Start again from the first page.",
        "cursor",
      );
    }

    const rows = await this.repository.list({
      workspaceId,
      reason: input.reason,
      emailPrefix: search || undefined,
      cursor,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);

    return {
      suppressions: page.map(
        (row): Suppression => ({
          id: row.id,
          email: row.email,
          reason: row.reason as SuppressionReason,
          origin: row.origin as SuppressionOrigin,
          sourceId: row.sourceId,
          note: row.note,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.cursorCreatedAt, id: last.id })
          : null,
    };
  }

  async add(
    actor: SuppressionActor,
    input: { emails?: unknown; reason?: unknown; note?: unknown },
  ) {
    const reason = input.reason ?? "manual";
    if (!manualReasons.includes(reason as SuppressionReason)) {
      throw validation(
        reason === "bounced" || reason === "complained"
          ? "Bounces and complaints are recorded automatically. Use manual or unsubscribed."
          : "reason must be manual or unsubscribed.",
        "reason",
      );
    }
    if (
      input.note !== undefined &&
      input.note !== null &&
      typeof input.note !== "string"
    ) {
      throw validation("note must be text.", "note");
    }
    const note = input.note?.trim() || null;
    if (note && note.length > maxNoteLength) {
      throw validation(
        `Keep the note to ${maxNoteLength} characters or fewer.`,
        "note",
      );
    }
    if (!Array.isArray(input.emails) || input.emails.length === 0) {
      throw validation("Add at least one email address.", "emails");
    }
    if (input.emails.length > maxEmails) {
      throw validation(
        `Add up to ${maxEmails} email addresses at a time.`,
        "emails",
      );
    }
    const unique = new Set<string>();
    for (const value of input.emails) {
      if (typeof value !== "string" || !isValidEmail(value)) {
        const shown =
          typeof value === "string" ? value.trim().slice(0, 100) : "";
        throw validation(
          shown
            ? `"${shown}" is not a valid email address. Fix or remove it and try again.`
            : "Every entry must be an email address. Remove the empty ones and try again.",
          "emails",
        );
      }
      unique.add(normalizeEmail(value));
    }

    const added = await this.repository.insertIgnoringExisting(
      [...unique].map((email) => ({
        workspaceId: actor.workspaceId,
        email,
        reason: reason as SuppressionReason,
        origin: actor.origin,
        note,
        createdByUserId: actor.userId,
      })),
    );
    return { added, existing: unique.size - added };
  }

  async remove(workspaceId: string, id: string) {
    const removed = uuidPattern.test(id)
      ? await this.repository.delete(workspaceId, id)
      : false;
    if (!removed) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "not_found",
        "This suppression was not found. It may already have been removed.",
      );
    }
  }
}
