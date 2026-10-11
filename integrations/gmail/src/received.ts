import {
  type Credentials,
  type DeliveryStatus,
  IntegrationError,
  type MessageAddress,
  type ReceivedContent,
  type ReceivedCursor,
  type ReceivedHeaderName,
  type ReceivedMessage,
  type ReceivedPage,
  type ReceivedQuery,
  receivedHeaderNames,
} from "@workspace/integration-core";
import { endpoints, type GmailContext } from "./config";
import { gmailApiError } from "./errors";
import { asString, isObject, type JsonObject, readJson, request } from "./http";
import { requireAccessToken } from "./send";

type Cursor = {
  historyId?: string;
  nextHistoryId?: string;
  pageToken?: string;
  after?: number;
};

type Part = {
  mimeType: string;
  filename: string;
  headers: Map<string, string>;
  data?: string;
  size: number;
  parts: Part[];
};

const inboxLabel = "INBOX";

const skippedLabels = ["DRAFT", "TRASH", "CHAT"];

const maxPageSize = 50;

const metadataConcurrency = 5;

const maxHeaderValueLength = 512;

const maxReferences = 100;

const maxSubjectLength = 998;

const maxRecipients = 50;

const maxParts = 200;

const maxPartDepth = 12;

const bodyPartLimit = 512 * 1024;

const reportPartLimit = 32 * 1024;

const dayMs = 24 * 60 * 60 * 1000;

const metadataHeaders = [
  "message-id",
  "in-reply-to",
  "references",
  "from",
  ...receivedHeaderNames,
];

const reportPattern = /^\s*multipart\/report\b/i;

const deliveryReportPattern = /report-type\s*=\s*"?\s*delivery-status/i;

const statusTypes = [
  "message/delivery-status",
  "message/global-delivery-status",
];

const headerOnlyTypes = [
  "text/rfc822-headers",
  "message/rfc822-headers",
  "message/global-headers",
];

const embeddedTypes = ["message/rfc822", "message/global"];

const idPattern = /^[A-Za-z0-9_-]{1,64}$/;

function inboxError(error: IntegrationError) {
  if (error.code === "quota_reached" || error.code === "daily_limit_reached") {
    return new IntegrationError(
      "rate_limited",
      "Gmail is receiving requests too quickly. Reading the inbox will resume shortly.",
      {
        retryAfterSeconds: error.retryAfterSeconds,
        providerStatus: error.providerStatus,
        providerCode: error.providerCode,
        providerMessage: error.providerMessage,
      },
    );
  }
  if (error.code === "insufficient_permission") {
    return new IntegrationError(
      "insufficient_permission",
      "Permission to read the inbox was not granted. Turn on reply detection again and allow reading.",
      {
        providerStatus: error.providerStatus,
        providerCode: error.providerCode,
        providerMessage: error.providerMessage,
      },
    );
  }
  return error;
}

export async function getJson(
  context: GmailContext,
  accessToken: string,
  url: URL | string,
): Promise<{ status: number; body: JsonObject }> {
  const response = await request(context.fetch, String(url), {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (response.status === 404) {
    return { status: 404, body: {} };
  }
  if (!response.ok) {
    throw inboxError(await gmailApiError(response));
  }
  return { status: response.status, body: await readJson(response) };
}

function readCursor(state: ReceivedCursor | null): Cursor {
  const text = (value: unknown) =>
    typeof value === "string" && value !== "" ? value : undefined;
  const after = state?.after;
  return {
    historyId: text(state?.historyId),
    nextHistoryId: text(state?.nextHistoryId),
    pageToken: text(state?.pageToken),
    after:
      typeof after === "number" && Number.isSafeInteger(after) && after > 0
        ? after
        : undefined,
  };
}

export function headerMap(payload: unknown) {
  const headers = new Map<string, string>();
  const list = isObject(payload) ? payload.headers : undefined;
  if (!Array.isArray(list)) {
    return headers;
  }
  for (const entry of list) {
    if (!isObject(entry)) {
      continue;
    }
    const name = asString(entry.name)?.toLowerCase();
    const value = typeof entry.value === "string" ? entry.value : undefined;
    if (name && value !== undefined && !headers.has(name)) {
      headers.set(name, value);
    }
  }
  return headers;
}

export function messageIdOf(value: string | undefined) {
  const found = value?.match(/<[^<>\s]+>/)?.[0];
  if (found) {
    return found;
  }
  const bare = value?.trim();
  return bare && !/\s/.test(bare) ? `<${bare}>` : undefined;
}

export function addressOf(value: string | undefined): MessageAddress | null {
  if (!value) {
    return null;
  }
  const angled = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const email = angled?.[1] ?? value.match(/[^\s<>,;"]+@[^\s<>,;"]+/)?.[0];
  if (!email) {
    return null;
  }
  const name = angled
    ? value
        .slice(0, value.indexOf(angled[0]))
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .trim()
    : "";
  return name ? { email, name } : { email };
}

function addressesOf(value: string | undefined) {
  return (value?.match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? []).slice(
    0,
    maxRecipients,
  );
}

export function internalDate(message: JsonObject) {
  const millis = Number(asString(message.internalDate));
  return Number.isFinite(millis) && millis > 0 ? new Date(millis) : null;
}

export function labelsOf(message: JsonObject) {
  return Array.isArray(message.labelIds)
    ? message.labelIds.filter(
        (label): label is string => typeof label === "string",
      )
    : [];
}

function toPart(value: unknown, depth: number, budget: { left: number }): Part {
  const node = isObject(value) ? value : {};
  const body = isObject(node.body) ? node.body : {};
  budget.left -= 1;
  const children =
    Array.isArray(node.parts) && depth < maxPartDepth ? node.parts : [];
  const parts: Part[] = [];
  for (const child of children) {
    if (budget.left <= 0) {
      break;
    }
    parts.push(toPart(child, depth + 1, budget));
  }
  return {
    mimeType: (asString(node.mimeType) ?? "").toLowerCase(),
    filename: asString(node.filename) ?? "",
    headers: headerMap(node),
    data: asString(body.data),
    size: typeof body.size === "number" ? body.size : 0,
    parts,
  };
}

function flatten(part: Part): Part[] {
  return [part, ...part.parts.flatMap(flatten)];
}

function decoderFor(part: Part) {
  const charset = /charset\s*=\s*"?([\w.:-]+)/i.exec(
    part.headers.get("content-type") ?? "",
  )?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8");
  } catch {
    return new TextDecoder("utf-8");
  }
}

function decode(part: Part, limit: number) {
  if (!part.data) {
    return null;
  }
  const encodedLimit = Math.ceil(limit / 3) * 4;
  const bytes = Buffer.from(
    part.data.slice(0, encodedLimit),
    "base64url",
  ).subarray(0, limit);
  return decoderFor(part).decode(bytes);
}

function isAttachment(part: Part) {
  const disposition = part.headers.get("content-disposition") ?? "";
  return part.filename !== "" || /^\s*attachment\b/i.test(disposition);
}

function field(block: string, name: string) {
  const unfolded = block.replace(/\r?\n[ \t]+/g, " ");
  const match = new RegExp(`^${name}\\s*:\\s*(.*)$`, "im").exec(unfolded);
  return match?.[1]?.trim() || undefined;
}

function recipientOf(value: string | undefined) {
  const address = value?.split(";").pop()?.trim();
  return address?.replace(/^<|>$/g, "") || undefined;
}

function deliveryStatusOf(root: Part): DeliveryStatus | undefined {
  const parts = flatten(root);
  const status = parts.find((part) => statusTypes.includes(part.mimeType));
  const report = status ? decode(status, reportPartLimit) : null;
  if (!report) {
    return undefined;
  }
  const embedded = parts.find((part) => embeddedTypes.includes(part.mimeType));
  const headerOnly = parts.find((part) =>
    headerOnlyTypes.includes(part.mimeType),
  );
  const originalMessageId = messageIdOf(
    embedded?.parts[0]?.headers.get("message-id") ??
      field(
        (embedded ? decode(embedded, reportPartLimit) : null) ??
          (headerOnly ? decode(headerOnly, reportPartLimit) : null) ??
          "",
        "message-id",
      ),
  );
  const result: DeliveryStatus = {
    action: field(report, "action"),
    status: field(report, "status"),
    originalMessageId,
    failedRecipient: recipientOf(
      field(report, "final-recipient") ?? field(report, "original-recipient"),
    ),
  };
  return Object.values(result).some((value) => value !== undefined)
    ? result
    : undefined;
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

async function readDeliveryStatus(
  context: GmailContext,
  accessToken: string,
  id: string,
) {
  const url = new URL(endpoints.message(id));
  url.searchParams.set("format", "full");
  const { status, body } = await getJson(context, accessToken, url);
  if (status === 404) {
    return undefined;
  }
  return deliveryStatusOf(toPart(body.payload, 0, { left: maxParts }));
}

async function readMetadata(
  context: GmailContext,
  accessToken: string,
  id: string,
): Promise<ReceivedMessage | null> {
  const url = new URL(endpoints.message(id));
  url.searchParams.set("format", "metadata");
  for (const name of metadataHeaders) {
    url.searchParams.append("metadataHeaders", name);
  }
  const { status, body } = await getJson(context, accessToken, url);
  if (status === 404) {
    return null;
  }
  const labels = labelsOf(body);
  if (
    !labels.includes(inboxLabel) ||
    skippedLabels.some((label) => labels.includes(label))
  ) {
    return null;
  }
  const fields = headerMap(body.payload);
  const messageId = messageIdOf(fields.get("message-id"));
  const inReplyTo = messageIdOf(fields.get("in-reply-to"));
  const from = addressOf(fields.get("from"));
  const contentType = fields.get("content-type") ?? "";
  const deliveryStatus =
    reportPattern.test(contentType) && deliveryReportPattern.test(contentType)
      ? await readDeliveryStatus(context, accessToken, id)
      : undefined;
  return {
    ref: id,
    ...(messageId ? { messageId } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
    references: (fields.get("references")?.match(/<[^<>\s]+>/g) ?? []).slice(
      -maxReferences,
    ),
    ...(from ? { from: { email: from.email } } : {}),
    receivedAt: internalDate(body) ?? new Date(),
    headers: pickHeaders(fields),
    ...(deliveryStatus ? { deliveryStatus } : {}),
  };
}

async function readAll(
  context: GmailContext,
  accessToken: string,
  ids: string[],
) {
  const results: (ReceivedMessage | null)[] = new Array(ids.length).fill(null);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(metadataConcurrency, ids.length) },
    async () => {
      while (next < ids.length) {
        const index = next;
        next += 1;
        const id = ids[index];
        if (id !== undefined) {
          results[index] = await readMetadata(context, accessToken, id);
        }
      }
    },
  );
  await Promise.all(workers);
  return results
    .filter((message): message is ReceivedMessage => message !== null)
    .sort(
      (left, right) => left.receivedAt.getTime() - right.receivedAt.getTime(),
    );
}

function idsOf(items: unknown, pick: (item: JsonObject) => unknown) {
  const ids: string[] = [];
  for (const item of Array.isArray(items) ? items : []) {
    const message = isObject(item) ? pick(item) : undefined;
    const id = isObject(message) ? asString(message.id) : undefined;
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

async function listHistory(
  context: GmailContext,
  accessToken: string,
  historyId: string,
  pageToken: string | undefined,
  limit: number,
): Promise<ReceivedPage | null> {
  const url = new URL(endpoints.history);
  url.searchParams.set("startHistoryId", historyId);
  url.searchParams.set("historyTypes", "messageAdded");
  url.searchParams.set("labelId", inboxLabel);
  url.searchParams.set("maxResults", String(limit));
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }
  const { status, body } = await getJson(context, accessToken, url);
  if (status === 404) {
    return null;
  }
  const ids = (Array.isArray(body.history) ? body.history : [])
    .flatMap((record) =>
      idsOf(
        isObject(record) ? record.messagesAdded : [],
        (item) => item.message,
      ),
    )
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(0, limit);
  const messages = await readAll(context, accessToken, ids);
  const nextPageToken = asString(body.nextPageToken);
  if (nextPageToken) {
    return {
      messages,
      state: { historyId, pageToken: nextPageToken },
      more: true,
    };
  }
  return {
    messages,
    state: { historyId: asString(body.historyId) ?? historyId },
    more: false,
  };
}

async function currentHistoryId(context: GmailContext, accessToken: string) {
  const { body } = await getJson(context, accessToken, endpoints.profile);
  const historyId = asString(body.historyId);
  if (!historyId) {
    throw new IntegrationError(
      "unknown",
      "Gmail did not return the state of the mailbox.",
    );
  }
  return historyId;
}

async function listSince(
  context: GmailContext,
  accessToken: string,
  input: { since: Date; cursor: Cursor; limit: number },
): Promise<ReceivedPage> {
  const resumed = input.cursor.nextHistoryId !== undefined;
  const nextHistoryId =
    input.cursor.nextHistoryId ??
    (await currentHistoryId(context, accessToken));
  const after =
    (resumed ? input.cursor.after : undefined) ??
    Math.floor((input.since.getTime() - dayMs) / 1000);
  const url = new URL(endpoints.messages);
  url.searchParams.set("q", `after:${after}`);
  url.searchParams.set("labelIds", inboxLabel);
  url.searchParams.set("maxResults", String(input.limit));
  if (resumed && input.cursor.pageToken) {
    url.searchParams.set("pageToken", input.cursor.pageToken);
  }
  const { body } = await getJson(context, accessToken, url);
  const ids = idsOf(body.messages, (item) => item).slice(0, input.limit);
  const messages = (await readAll(context, accessToken, ids)).filter(
    (message) => message.receivedAt.getTime() >= input.since.getTime(),
  );
  const nextPageToken = asString(body.nextPageToken);
  if (nextPageToken) {
    return {
      messages,
      state: { nextHistoryId, pageToken: nextPageToken, after },
      more: true,
    };
  }
  return { messages, state: { historyId: nextHistoryId }, more: false };
}

export async function listReceived(
  context: GmailContext,
  credentials: Credentials,
  input: ReceivedQuery,
): Promise<ReceivedPage> {
  const accessToken = requireAccessToken(credentials);
  const limit = Math.min(
    Math.max(Number.isFinite(input.limit) ? Math.floor(input.limit) : 1, 1),
    maxPageSize,
  );
  const cursor = readCursor(input.state);
  if (cursor.historyId && !cursor.nextHistoryId) {
    const page = await listHistory(
      context,
      accessToken,
      cursor.historyId,
      cursor.pageToken,
      limit,
    );
    if (page) {
      return page;
    }
    return listSince(context, accessToken, {
      since: input.since,
      cursor: {},
      limit,
    });
  }
  return listSince(context, accessToken, { since: input.since, cursor, limit });
}

function selectBodies(root: Part) {
  let text: Part | undefined;
  let html: Part | undefined;
  const visit = (part: Part) => {
    if (embeddedTypes.includes(part.mimeType) || isAttachment(part)) {
      return;
    }
    if (part.mimeType === "text/plain" && !text) {
      text = part;
    }
    if (part.mimeType === "text/html" && !html) {
      html = part;
    }
    for (const child of part.parts) {
      visit(child);
    }
  };
  visit(root);
  return { text, html };
}

export async function fetchReceived(
  context: GmailContext,
  credentials: Credentials,
  ref: string,
): Promise<ReceivedContent | null> {
  const accessToken = requireAccessToken(credentials);
  if (!idPattern.test(ref)) {
    return null;
  }
  const url = new URL(endpoints.message(ref));
  url.searchParams.set("format", "full");
  const { status, body } = await getJson(context, accessToken, url);
  if (status === 404) {
    return null;
  }
  const root = toPart(body.payload, 0, { left: maxParts });
  const bodies = selectBodies(root);
  const sent = Date.parse(root.headers.get("date") ?? "");
  return {
    subject: (root.headers.get("subject") ?? "").slice(0, maxSubjectLength),
    text: bodies.text ? decode(bodies.text, bodyPartLimit) : null,
    html: bodies.html ? decode(bodies.html, bodyPartLimit) : null,
    from: addressOf(root.headers.get("from")),
    to: addressesOf(root.headers.get("to")),
    date: Number.isNaN(sent) ? internalDate(body) : new Date(sent),
  };
}
