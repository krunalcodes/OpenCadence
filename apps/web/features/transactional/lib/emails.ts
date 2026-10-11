import {
  countOf,
  isRow,
  type Row,
  rowsOf,
  textOrNull,
  textsOf,
} from "@/lib/api";

export type EmailStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "delayed"
  | "bounced"
  | "complained"
  | "failed"
  | "skipped";

export type EmailKind = "transactional" | "campaign" | "sequence" | "test";

export type EmailError = { code: string; message: string };

export type Email = {
  id: string;
  createdAt: string;
  kind: EmailKind;
  status: EmailStatus;
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
  error: EmailError | null;
  attempts: number;
  sentAt: string | null;
  lastEventAt: string | null;
};

export type EmailContent = {
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
};

export type EmailDetail = Email & { content: EmailContent | null };

export type EmailsPage = { emails: Email[]; nextCursor: string | null };

export type EmailsResult =
  | ({ state: "ready" } & EmailsPage)
  | { state: "failed" };

export type EmailFilters = {
  status: EmailStatus | null;
  sourceId: string | null;
};

export type SourceOption = {
  value: string;
  label: string;
  integrationType: string;
};

export const emailPageSize = 50;

export const emailStatuses: EmailStatus[] = [
  "queued",
  "sent",
  "delivered",
  "delayed",
  "bounced",
  "complained",
  "failed",
  "skipped",
];

const kinds: EmailKind[] = ["transactional", "campaign", "sequence", "test"];

function textMap(value: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (isRow(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string") {
        map[key] = item;
      }
    }
  }
  return map;
}

export function toEmail(value: unknown): Email | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const createdAt = textOrNull(value.createdAt);
  if (!id || !createdAt) {
    return null;
  }
  const from = isRow(value.from) ? value.from : {};
  const error = isRow(value.error) ? value.error : null;
  return {
    id,
    createdAt,
    kind: kinds.find((kind) => kind === value.kind) ?? "transactional",
    status: emailStatuses.find((status) => status === value.status) ?? "queued",
    sourceId: textOrNull(value.sourceId) ?? "",
    sourceName: textOrNull(value.sourceName) ?? "",
    integrationType: textOrNull(value.integrationType) ?? "",
    from: {
      email: textOrNull(from.email) ?? "",
      name: textOrNull(from.name),
    },
    to: textsOf(value.to),
    cc: textsOf(value.cc),
    bcc: textsOf(value.bcc),
    suppressed: textsOf(value.suppressed),
    subject: textOrNull(value.subject) ?? "",
    tags: textMap(value.tags),
    error: error
      ? {
          code: textOrNull(error.code) ?? "",
          message: textOrNull(error.message) ?? "",
        }
      : null,
    attempts: countOf(value.attempts),
    sentAt: textOrNull(value.sentAt),
    lastEventAt: textOrNull(value.lastEventAt),
  };
}

export function toEmailDetail(value: unknown): EmailDetail | null {
  const email = toEmail(value);
  if (!email || !isRow(value)) {
    return null;
  }
  const content = isRow(value.content) ? value.content : null;
  return {
    ...email,
    content: content
      ? {
          html: textOrNull(content.html),
          text: textOrNull(content.text),
          headers: textMap(content.headers),
        }
      : null,
  };
}

export function toEmailsPage(value: unknown): EmailsPage | null {
  if (!isRow(value) || !Array.isArray(value.emails)) {
    return null;
  }
  return {
    emails: rowsOf(value.emails).flatMap((item) => {
      const email = toEmail(item);
      return email ? [email] : [];
    }),
    nextCursor: textOrNull(value.nextCursor),
  };
}

function toSourceOption(value: Row): SourceOption | null {
  const id = textOrNull(value.id);
  const integrationType = textOrNull(value.integrationType);
  if (!id || !integrationType) {
    return null;
  }
  return {
    value: id,
    label: textOrNull(value.name) ?? textOrNull(value.email) ?? integrationType,
    integrationType,
  };
}

export function toSourceOptions(value: unknown): SourceOption[] {
  if (!isRow(value)) {
    return [];
  }
  return rowsOf(value.sources).flatMap((item) => {
    const option = toSourceOption(item);
    return option ? [option] : [];
  });
}

export function emailsQuery(filters: EmailFilters, cursor?: string | null) {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.sourceId) {
    params.set("sourceId", filters.sourceId);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("limit", String(emailPageSize));
  return params.toString();
}

export function filtersSearch(filters: EmailFilters) {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.sourceId) {
    params.set("sourceId", filters.sourceId);
  }
  return params.toString();
}

export function toStatusFilter(value: string | null): EmailStatus | null {
  return emailStatuses.find((status) => status === value) ?? null;
}
