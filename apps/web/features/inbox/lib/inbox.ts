import { countOf, isRow, rowsOf, textOrNull, textsOf } from "@/lib/api";

export type ThreadStatus = "open" | "closed";

export type StatusFilter = "open" | "closed" | "all";

export type Direction = "inbound" | "outbound";

export type DeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "delayed"
  | "bounced"
  | "complained"
  | "failed"
  | "skipped";

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
  lastDirection: Direction;
  lastMessageAt: string;
};

export type InboxMessage = {
  id: string;
  direction: Direction;
  from: { email: string; name: string | null };
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  occurredAt: string;
  status: DeliveryStatus | null;
};

export type ThreadDetail = Thread & { messages: InboxMessage[] };

export type ThreadsPage = {
  items: Thread[];
  nextCursor: string | null;
  unreadCount: number;
};

export type ThreadsResult =
  | ({ state: "ready" } & ThreadsPage)
  | { state: "failed" };

export type ThreadResult =
  | { state: "ready"; thread: ThreadDetail }
  | { state: "missing" }
  | { state: "failed" };

export type InboxFilters = {
  status: StatusFilter;
  unread: boolean;
  sourceId: string | null;
  search: string;
};

export const threadPageSize = 30;
export const maxSearchLength = 200;
export const maxReplyLength = 100_000;
export const refreshEveryMs = 30_000;
export const statusFilters: StatusFilter[] = ["open", "closed", "all"];

export const defaultFilters: InboxFilters = {
  status: "open",
  unread: false,
  sourceId: null,
  search: "",
};

const deliveryStatuses: DeliveryStatus[] = [
  "queued",
  "sent",
  "delivered",
  "delayed",
  "bounced",
  "complained",
  "failed",
  "skipped",
];

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isId(value: string | null | undefined): value is string {
  return typeof value === "string" && idPattern.test(value);
}

function toDirection(value: unknown): Direction {
  return value === "outbound" ? "outbound" : "inbound";
}

function toOrigin(value: unknown): ThreadOrigin | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const name = textOrNull(value.name);
  if (
    !id ||
    !name ||
    (value.type !== "campaign" && value.type !== "sequence")
  ) {
    return null;
  }
  return { type: value.type, id, name };
}

export function toThread(value: unknown): Thread | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const contact = isRow(value.contact) ? value.contact : {};
  const email = textOrNull(contact.email);
  if (!id || !email) {
    return null;
  }
  const source = isRow(value.source) ? value.source : {};
  return {
    id,
    contact: {
      id: textOrNull(contact.id),
      email,
      name: textOrNull(contact.name),
    },
    subject: textOrNull(value.subject) ?? "",
    snippet: textOrNull(value.snippet) ?? "",
    status: value.status === "closed" ? "closed" : "open",
    unread: value.unread === true,
    source: {
      id: textOrNull(source.id) ?? "",
      name: textOrNull(source.name) ?? "",
      email: textOrNull(source.email),
    },
    origin: toOrigin(value.origin),
    messageCount: countOf(value.messageCount),
    lastDirection: toDirection(value.lastDirection),
    lastMessageAt: textOrNull(value.lastMessageAt) ?? "",
  };
}

export function toMessage(value: unknown): InboxMessage | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  if (!id) {
    return null;
  }
  const from = isRow(value.from) ? value.from : {};
  return {
    id,
    direction: toDirection(value.direction),
    from: {
      email: textOrNull(from.email) ?? "",
      name: textOrNull(from.name),
    },
    to: textsOf(value.to),
    subject: textOrNull(value.subject) ?? "",
    text: textOrNull(value.text),
    html: textOrNull(value.html),
    occurredAt: textOrNull(value.occurredAt) ?? "",
    status: deliveryStatuses.find((status) => status === value.status) ?? null,
  };
}

export function toThreadDetail(value: unknown): ThreadDetail | null {
  const thread = toThread(value);
  if (!thread || !isRow(value) || !Array.isArray(value.messages)) {
    return null;
  }
  return {
    ...thread,
    messages: rowsOf(value.messages).flatMap((item) => {
      const message = toMessage(item);
      return message ? [message] : [];
    }),
  };
}

export function toThreadsPage(value: unknown): ThreadsPage | null {
  if (!isRow(value) || !Array.isArray(value.items)) {
    return null;
  }
  return {
    items: rowsOf(value.items).flatMap((item) => {
      const thread = toThread(item);
      return thread ? [thread] : [];
    }),
    nextCursor: textOrNull(value.nextCursor),
    unreadCount: countOf(value.unreadCount),
  };
}

export function threadsQuery(filters: InboxFilters, cursor?: string | null) {
  const params = new URLSearchParams();
  params.set("status", filters.status);
  if (filters.unread) {
    params.set("unread", "true");
  }
  if (filters.sourceId) {
    params.set("sourceId", filters.sourceId);
  }
  if (filters.search !== "") {
    params.set("search", filters.search);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("limit", String(threadPageSize));
  return params.toString();
}

export function threadPath(id: string) {
  return `/inbox/threads/${encodeURIComponent(id)}`;
}

export function inboxSearch(filters: InboxFilters, threadId: string | null) {
  const params = new URLSearchParams();
  if (filters.status !== defaultFilters.status) {
    params.set("status", filters.status);
  }
  if (filters.unread) {
    params.set("unread", "1");
  }
  if (filters.sourceId) {
    params.set("source", filters.sourceId);
  }
  if (filters.search !== "") {
    params.set("q", filters.search);
  }
  if (threadId) {
    params.set("thread", threadId);
  }
  return params.toString();
}

export function toFilters(params: {
  status: string | null;
  unread: string | null;
  source: string | null;
  q: string | null;
}): InboxFilters {
  return {
    status:
      statusFilters.find((status) => status === params.status) ??
      defaultFilters.status,
    unread: params.unread === "1" || params.unread === "true",
    sourceId: isId(params.source) ? params.source : null,
    search: (params.q ?? "").trim().slice(0, maxSearchLength),
  };
}

export function filtersKey(filters: InboxFilters) {
  return inboxSearch(filters, null);
}

export function isFiltered(filters: InboxFilters) {
  return filtersKey(filters) !== "";
}

export function contactLabel(thread: Pick<Thread, "contact">) {
  return thread.contact.name ?? thread.contact.email;
}

export function hasOriginal(messages: InboxMessage[]) {
  return messages[0]?.direction === "outbound";
}

function timeOf(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function mergeFirstPage(
  current: Thread[],
  fresh: ThreadsPage,
  keepTail: boolean,
): Thread[] {
  if (!keepTail || fresh.nextCursor === null) {
    return fresh.items;
  }
  const known = new Set(fresh.items.map((item) => item.id));
  const oldest = fresh.items.at(-1);
  const boundary = oldest ? timeOf(oldest.lastMessageAt) : 0;
  return [
    ...fresh.items,
    ...current.filter(
      (item) => !known.has(item.id) && timeOf(item.lastMessageAt) < boundary,
    ),
  ];
}

export function appendPage(current: Thread[], page: Thread[]): Thread[] {
  const known = new Set(current.map((item) => item.id));
  return [...current, ...page.filter((item) => !known.has(item.id))];
}

export type RelativeTime =
  | { unit: "now" }
  | { unit: "minutes" | "hours" | "days"; value: number }
  | { unit: "date" };

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

export function relativeTime(value: string, now: number): RelativeTime {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return { unit: "date" };
  }
  const elapsed = Math.max(0, now - time);
  if (elapsed < minuteMs) {
    return { unit: "now" };
  }
  if (elapsed < hourMs) {
    return { unit: "minutes", value: Math.floor(elapsed / minuteMs) };
  }
  if (elapsed < dayMs) {
    return { unit: "hours", value: Math.floor(elapsed / hourMs) };
  }
  if (elapsed < 7 * dayMs) {
    return { unit: "days", value: Math.floor(elapsed / dayMs) };
  }
  return { unit: "date" };
}
