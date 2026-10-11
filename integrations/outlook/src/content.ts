import type {
  Credentials,
  MessageAddress,
  ReceivedContent,
} from "@workspace/integration-core";
import { endpoints, type OutlookContext } from "./config";
import { graphApiError } from "./errors";
import {
  asString,
  graphGet,
  immutableIdPreference,
  isObject,
  type JsonObject,
  readJson,
} from "./http";
import { requireInboxToken } from "./received";

export const bodyLimit = 256 * 1024;

const maxSubjectLength = 998;

const maxRecipients = 50;

const maxRefLength = 1024;

const contentSelect =
  "subject,body,from,sender,toRecipients,sentDateTime,receivedDateTime";

const textPreference = 'outlook.body-content-type="text"';

function mailbox(value: unknown): MessageAddress | null {
  if (!isObject(value) || !isObject(value.emailAddress)) {
    return null;
  }
  const email = asString(value.emailAddress.address)?.trim();
  if (!email?.includes("@")) {
    return null;
  }
  const name = asString(value.emailAddress.name)?.trim();
  return name && name !== email ? { email, name } : { email };
}

function toDate(value: unknown) {
  const text = asString(value);
  if (!text) {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function bodyOf(message: JsonObject) {
  const body = isObject(message.body) ? message.body : {};
  const content =
    typeof body.content === "string"
      ? body.content.slice(0, bodyLimit).replaceAll("\u0000", "")
      : null;
  return {
    isHtml: asString(body.contentType)?.toLowerCase() === "html",
    content,
  };
}

async function getMessage(
  context: OutlookContext,
  accessToken: string,
  ref: string,
  select: string,
  prefer: string[],
) {
  const response = await graphGet(
    context.fetch,
    `${endpoints.message(ref)}?$select=${select}`,
    accessToken,
    [immutableIdPreference, ...prefer],
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await graphApiError(response);
  }
  return readJson(response);
}

export async function fetchReceived(
  context: OutlookContext,
  credentials: Credentials,
  ref: string,
): Promise<ReceivedContent | null> {
  const accessToken = requireInboxToken(credentials);
  if (ref === "" || ref.length > maxRefLength || /\s/.test(ref)) {
    return null;
  }
  const message = await getMessage(
    context,
    accessToken,
    ref,
    contentSelect,
    [],
  );
  if (!message) {
    return null;
  }
  const native = bodyOf(message);
  const plain = native.isHtml
    ? await getMessage(context, accessToken, ref, "body", [textPreference])
    : null;
  return {
    subject: (asString(message.subject) ?? "").slice(0, maxSubjectLength),
    text: native.isHtml
      ? plain
        ? bodyOf(plain).content
        : null
      : native.content,
    html: native.isHtml ? native.content : null,
    from: mailbox(message.from) ?? mailbox(message.sender),
    to: (Array.isArray(message.toRecipients) ? message.toRecipients : [])
      .map((entry) => mailbox(entry)?.email)
      .filter((email): email is string => email !== undefined)
      .slice(0, maxRecipients),
    date: toDate(message.sentDateTime) ?? toDate(message.receivedDateTime),
  };
}
