import {
  type Credentials,
  type DeliveryStatus,
  IntegrationError,
  type ReceivedCursor,
  type ReceivedHeaderName,
  type ReceivedMessage,
  type ReceivedPage,
  type ReceivedQuery,
  receivedHeaderNames,
} from "@workspace/integration-core";
import {
  endpoints,
  graphOrigin,
  type OutlookContext,
  outlookMailReadScope,
} from "./config";
import { readDeliveryReport } from "./delivery-status";
import { graphApiError, graphFailure } from "./errors";
import {
  asString,
  graphGet,
  hasScope,
  immutableIdPreference,
  isObject,
  type JsonObject,
  readJson,
  readText,
  requireAccessToken,
} from "./http";
import { normalizeMessageId } from "./mime";

type Cursor = { link: string; seen: number };

type Session = { context: OutlookContext; accessToken: string };

export const maxPageSize = 50;

export const headerFetchConcurrency = 3;

export const resyncAfterMessages = 4000;

const maxHeaderValueLength = 512;

const maxReferences = 100;

const reportReadLimit = 128 * 1024;

const deltaSelect = "id,internetMessageId,from,sender,receivedDateTime";

const detailSelect =
  "internetMessageId,internetMessageHeaders,from,sender,receivedDateTime";

const staleLinkStatuses = [400, 404, 410];

const reportFailureCodes = ["auth_expired", "auth_revoked", "rate_limited"];

const reportPattern = /^\s*multipart\/report\b/i;

const deliveryReportPattern = /report-type\s*=\s*"?\s*delivery-status/i;

const ndrMarkerHeader = "x-ms-exchange-message-is-ndr";

const messageIdsPattern = /<[^<>\s]+>/g;

export function requireInboxToken(credentials: Credentials): string {
  const accessToken = requireAccessToken(credentials);
  if (
    credentials.kind !== "oauth2" ||
    !["Mail.ReadWrite", outlookMailReadScope].some((scope) =>
      hasScope(credentials.scopes, scope),
    )
  ) {
    throw new IntegrationError(
      "insufficient_permission",
      "Permission to read the inbox was not granted. Reconnect the account and allow reading mail.",
    );
  }
  return accessToken;
}

function isGraphLink(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.origin === graphOrigin;
  } catch {
    return false;
  }
}

function readCursor(state: ReceivedCursor | null): Cursor | null {
  const link = state?.link;
  if (typeof link !== "string" || !isGraphLink(link)) {
    return null;
  }
  const seen = state?.seen;
  return {
    link,
    seen:
      typeof seen === "number" && Number.isSafeInteger(seen) && seen > 0
        ? seen
        : 0,
  };
}

function initialUrl(since: Date) {
  const from = since.toISOString().replace(/\.\d{3}Z$/, "Z");
  return `${endpoints.inboxDelta}?changeType=created&$select=${deltaSelect}&$filter=receivedDateTime+ge+${from}`;
}

function getPage(session: Session, url: string, limit: number) {
  return graphGet(session.context.fetch, url, session.accessToken, [
    immutableIdPreference,
    `odata.maxpagesize=${limit}`,
  ]);
}

async function openPage(
  session: Session,
  saved: Cursor | null,
  input: ReceivedQuery,
  limit: number,
): Promise<{ body: JsonObject; cursor: Cursor | null }> {
  if (saved) {
    const response = await getPage(session, saved.link, limit);
    if (response.ok) {
      return { body: await readJson(response), cursor: saved };
    }
    const failure = await graphFailure(response);
    if (!failure.staleCursor && !staleLinkStatuses.includes(failure.status)) {
      throw failure.error;
    }
  }
  const response = await getPage(session, initialUrl(input.since), limit);
  if (!response.ok) {
    throw await graphApiError(response);
  }
  return { body: await readJson(response), cursor: null };
}

function toDate(value: unknown) {
  const text = asString(value);
  if (!text) {
    return undefined;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function addressOf(value: unknown) {
  if (!isObject(value) || !isObject(value.emailAddress)) {
    return undefined;
  }
  const address = asString(value.emailAddress.address)?.trim();
  return address?.includes("@") ? address : undefined;
}

function headerFields(value: unknown) {
  const fields = new Map<string, string>();
  if (!Array.isArray(value)) {
    return fields;
  }
  for (const entry of value) {
    if (!isObject(entry)) {
      continue;
    }
    const name = asString(entry.name)?.trim().toLowerCase();
    if (name && typeof entry.value === "string" && !fields.has(name)) {
      fields.set(name, entry.value.replace(/\s+/g, " ").trim());
    }
  }
  return fields;
}

function pickHeaders(fields: Map<string, string>) {
  const headers: Partial<Record<ReceivedHeaderName, string>> = {};
  for (const name of receivedHeaderNames) {
    const value = fields.get(name);
    if (value !== undefined) {
      headers[name] = value.slice(0, maxHeaderValueLength);
    }
  }
  return headers;
}

function isDeliveryReport(fields: Map<string, string>) {
  const contentType = fields.get("content-type") ?? "";
  return (
    fields.has(ndrMarkerHeader) ||
    (reportPattern.test(contentType) && deliveryReportPattern.test(contentType))
  );
}

async function fetchDeliveryStatus(
  session: Session,
  id: string,
): Promise<DeliveryStatus | undefined> {
  const response = await graphGet(
    session.context.fetch,
    `${endpoints.message(id)}/$value`,
    session.accessToken,
    [immutableIdPreference],
  );
  if (!response.ok) {
    const error = await graphApiError(response);
    if (reportFailureCodes.includes(error.code)) {
      throw error;
    }
    return undefined;
  }
  return readDeliveryReport(await readText(response, reportReadLimit));
}

async function fetchDetail(session: Session, id: string) {
  const response = await graphGet(
    session.context.fetch,
    `${endpoints.message(id)}?$select=${detailSelect}`,
    session.accessToken,
    [immutableIdPreference],
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await graphApiError(response);
  }
  return readJson(response);
}

async function toReceived(
  session: Session,
  id: string,
  entry: JsonObject,
): Promise<ReceivedMessage> {
  const detail = await fetchDetail(session, id);
  const source = detail ?? entry;
  const fields = headerFields(detail?.internetMessageHeaders);
  const messageId = normalizeMessageId(
    asString(source.internetMessageId) ?? asString(entry.internetMessageId),
  );
  const inReplyTo = fields.get("in-reply-to")?.match(messageIdsPattern)?.[0];
  const from =
    addressOf(source.from) ??
    addressOf(source.sender) ??
    addressOf(entry.from) ??
    addressOf(entry.sender);
  const deliveryStatus =
    detail && isDeliveryReport(fields)
      ? await fetchDeliveryStatus(session, id)
      : undefined;
  return {
    ref: id,
    ...(messageId ? { messageId } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
    references: (
      fields.get("references")?.match(messageIdsPattern) ?? []
    ).slice(-maxReferences),
    ...(from ? { from: { email: from } } : {}),
    receivedAt:
      toDate(source.receivedDateTime) ??
      toDate(entry.receivedDateTime) ??
      new Date(),
    headers: pickHeaders(fields),
    ...(deliveryStatus ? { deliveryStatus } : {}),
  };
}

async function mapLimited<T, R>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

function listEntries(body: JsonObject) {
  const entries = new Map<string, JsonObject>();
  for (const entry of Array.isArray(body.value) ? body.value : []) {
    const id = isObject(entry) ? asString(entry.id) : undefined;
    if (id && isObject(entry) && entry["@removed"] === undefined) {
      entries.set(id, entry);
    }
  }
  return [...entries];
}

export async function listReceived(
  context: OutlookContext,
  credentials: Credentials,
  input: ReceivedQuery,
): Promise<ReceivedPage> {
  const session = { context, accessToken: requireInboxToken(credentials) };
  const limit = Math.min(
    Math.max(Number.isFinite(input.limit) ? Math.floor(input.limit) : 1, 1),
    maxPageSize,
  );
  const { body, cursor } = await openPage(
    session,
    readCursor(input.state),
    input,
    limit,
  );
  const entries = listEntries(body);
  const received = await mapLimited(
    entries,
    headerFetchConcurrency,
    ([id, entry]) => toReceived(session, id, entry),
  );
  const messages = received
    .filter(
      (message) =>
        cursor !== null ||
        message.receivedAt.getTime() >= input.since.getTime(),
    )
    .sort(
      (left, right) => left.receivedAt.getTime() - right.receivedAt.getTime(),
    );

  const seen = (cursor?.seen ?? 0) + entries.length;
  const nextLink = asString(body["@odata.nextLink"]);
  if (isGraphLink(nextLink)) {
    return { messages, state: { link: nextLink, seen }, more: true };
  }
  const deltaLink = asString(body["@odata.deltaLink"]);
  if (isGraphLink(deltaLink) && seen < resyncAfterMessages) {
    return { messages, state: { link: deltaLink, seen }, more: false };
  }
  return { messages, state: { seen: 0 }, more: false };
}
