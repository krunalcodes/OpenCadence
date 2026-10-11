import {
  type Credentials,
  type InboxActionResult,
  type InboxMessage,
  type InboxSearch,
  type InboxSupport,
  IntegrationError,
} from "@workspace/integration-core";
import { endpoints, type GmailContext } from "./config";
import { asString, isObject } from "./http";
import {
  addressOf,
  fetchReceived,
  getJson,
  headerMap,
  internalDate,
  labelsOf,
  listReceived,
  messageIdOf,
} from "./received";
import { requireAccessToken } from "./send";

const searchHeaders = [
  "message-id",
  "in-reply-to",
  "references",
  "from",
  "to",
  "subject",
];

async function search(
  context: GmailContext,
  credentials: Credentials,
  query: InboxSearch,
): Promise<InboxMessage | null> {
  const accessToken = requireAccessToken(credentials);
  const wanted = messageIdOf(query.messageId);
  if (!wanted) {
    return null;
  }
  const list = new URL(endpoints.messages);
  list.searchParams.set("q", `rfc822msgid:${wanted.slice(1, -1)}`);
  list.searchParams.set("maxResults", "1");
  list.searchParams.set("includeSpamTrash", String(query.includeSpam));
  const found = await getJson(context, accessToken, list);
  const first = Array.isArray(found.body.messages)
    ? found.body.messages[0]
    : undefined;
  const id = isObject(first) ? asString(first.id) : undefined;
  if (!id) {
    return null;
  }
  const url = new URL(endpoints.message(id));
  url.searchParams.set("format", "metadata");
  for (const name of searchHeaders) {
    url.searchParams.append("metadataHeaders", name);
  }
  const { status, body } = await getJson(context, accessToken, url);
  if (status === 404) {
    return null;
  }
  const labels = labelsOf(body);
  const fields = headerMap(body.payload);
  const receivedAt = internalDate(body) ?? new Date();
  if (
    labels.includes("TRASH") ||
    receivedAt.getTime() < query.since.getTime()
  ) {
    return null;
  }
  const from = addressOf(fields.get("from"));
  const to = addressOf(fields.get("to"));
  return {
    providerMessageId: id,
    providerThreadId: asString(body.threadId),
    messageId: messageIdOf(fields.get("message-id")),
    inReplyTo: messageIdOf(fields.get("in-reply-to")),
    references: fields.get("references")?.match(/<[^<>\s]+>/g) ?? [],
    ...(from ? { from } : {}),
    to: to ? [to] : [],
    subject: fields.get("subject"),
    receivedAt,
    flags: {
      isSpam: labels.includes("SPAM"),
      isUnread: labels.includes("UNREAD"),
      isInInbox: labels.includes("INBOX"),
      isStarred: labels.includes("STARRED"),
      isImportant: labels.includes("IMPORTANT"),
    },
  };
}

export function createInbox(context: GmailContext): InboxSupport {
  return {
    search: (credentials, query) => search(context, credentials, query),
    applyActions: async (
      _credentials,
      ref,
      actions,
    ): Promise<InboxActionResult> => ({
      ref,
      unsupported: actions.map((action) => action.type),
    }),
    ensureFolder: async () => {
      throw new IntegrationError(
        "insufficient_permission",
        "Gmail is connected with read-only access, so labels cannot be created.",
      );
    },
    listReceived: (credentials, input) =>
      listReceived(context, credentials, input),
    fetchReceived: (credentials, ref) =>
      fetchReceived(context, credentials, ref),
  };
}
