import { randomBytes } from "node:crypto";
import {
  type MessageHeader,
  type MessageTag,
  SendEmailCommand,
  type SendEmailCommandInput,
  type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2";
import {
  type Credentials,
  IntegrationError,
  type OutboundMessage,
  type SendResult,
} from "@workspace/integration-core";
import { accessKeyFrom, call } from "./client";
import {
  configurationSetHeader,
  configurationSetNamePattern,
  maxRecipients,
  maxSimpleHeaderLength,
  maxSimpleHeaderNameLength,
  maxSimpleHeaders,
  maxSimpleHeaderValueLength,
  maxTagLength,
  type ResolvedSesConfig,
} from "./config";
import { unexpectedResponseError } from "./errors";
import {
  buildMime,
  formatAddress,
  formatMessageId,
  isPrintableAscii,
  singleLine,
  toAsciiAddress,
} from "./mime";

const managedHeaderNames = [
  "bcc",
  "cc",
  "content-disposition",
  "content-transfer-encoding",
  "content-type",
  "date",
  "from",
  "message-id",
  "mime-version",
  "reply-to",
  "return-path",
  "subject",
  "to",
];

const simpleHeaderNamePattern = /^[!-9;-@A-~]+$/;

const charset = "UTF-8";

type Prepared = {
  from: string;
  fromEmail: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string;
  subject: string;
  inReplyTo?: string;
  references: string[];
  headers: Array<[string, string]>;
  configurationSetName?: string;
  tags?: MessageTag[];
};

function invalid(message: string) {
  return new IntegrationError("validation", message);
}

function sanitizeTag(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, maxTagLength);
}

function toTags(tags: Record<string, string> | undefined) {
  const entries = Object.entries(tags ?? {})
    .map(([name, value]) => ({
      Name: sanitizeTag(name),
      Value: sanitizeTag(value),
    }))
    .filter((tag) => tag.Name && tag.Value);
  return entries.length > 0 ? entries : undefined;
}

function headerValue(headers: Record<string, string>, name: string) {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) {
      return value;
    }
  }
  return undefined;
}

function splitReferences(value: string | undefined) {
  return value ? value.split(/\s+/).filter((entry) => entry.length > 0) : [];
}

function prepare(
  config: ResolvedSesConfig,
  message: OutboundMessage,
): Prepared {
  const to = message.to.map(toAsciiAddress);
  const cc = (message.cc ?? []).map(toAsciiAddress);
  const bcc = (message.bcc ?? []).map(toAsciiAddress);
  const total = to.length + cc.length + bcc.length;
  if (total === 0 || total > maxRecipients) {
    throw invalid(
      `Amazon SES accepts between 1 and ${maxRecipients} recipients per email, counting to, cc, and bcc.`,
    );
  }
  if (message.html === undefined && message.text === undefined) {
    throw invalid("An email needs an HTML body or a text body.");
  }

  const supplied = message.headers ?? {};
  const configurationSetName =
    singleLine(headerValue(supplied, configurationSetHeader) ?? "") ||
    config.configurationSetName;
  if (
    configurationSetName !== undefined &&
    !configurationSetNamePattern.test(configurationSetName)
  ) {
    throw invalid("The configuration set name is not valid.");
  }

  const inReplyTo =
    message.thread?.inReplyTo ?? headerValue(supplied, "in-reply-to");
  const references = message.thread?.references?.length
    ? message.thread.references
    : splitReferences(headerValue(supplied, "references"));
  const skipped = [
    ...managedHeaderNames,
    configurationSetHeader,
    "in-reply-to",
    "references",
  ];
  const headers = Object.entries(supplied)
    .filter(([name]) => !skipped.includes(name.toLowerCase()))
    .map(([name, value]): [string, string] => [name, singleLine(value)])
    .filter(([, value]) => value.length > 0);

  return {
    from: formatAddress(message.from),
    fromEmail: toAsciiAddress(message.from.email),
    to,
    cc,
    bcc,
    replyTo: message.replyTo ? toAsciiAddress(message.replyTo) : undefined,
    subject: singleLine(message.subject),
    inReplyTo: inReplyTo ? formatMessageId(inReplyTo) : undefined,
    references: references.map(formatMessageId),
    headers,
    configurationSetName,
    tags: toTags(message.tags),
  };
}

function simpleHeaders(prepared: Prepared): MessageHeader[] | null {
  const headers: Array<[string, string]> = [];
  if (prepared.inReplyTo) {
    headers.push(["In-Reply-To", prepared.inReplyTo]);
  }
  if (prepared.references.length > 0) {
    headers.push(["References", prepared.references.join(" ")]);
  }
  headers.push(...prepared.headers);
  const fits =
    headers.length <= maxSimpleHeaders &&
    headers.every(
      ([name, value]) =>
        simpleHeaderNamePattern.test(name) &&
        name.length <= maxSimpleHeaderNameLength &&
        isPrintableAscii(value) &&
        value.length <= maxSimpleHeaderValueLength &&
        name.length + value.length <= maxSimpleHeaderLength,
    );
  return fits ? headers.map(([Name, Value]) => ({ Name, Value })) : null;
}

function destination(prepared: Prepared) {
  return {
    ToAddresses: prepared.to.length > 0 ? prepared.to : undefined,
    CcAddresses: prepared.cc.length > 0 ? prepared.cc : undefined,
    BccAddresses: prepared.bcc.length > 0 ? prepared.bcc : undefined,
  };
}

export function toSendEmailInput(
  config: ResolvedSesConfig,
  message: OutboundMessage,
): SendEmailCommandInput {
  const prepared = prepare(config, message);
  const shared = {
    Destination: destination(prepared),
    ConfigurationSetName: prepared.configurationSetName,
    EmailTags: prepared.tags,
  };
  const headers = simpleHeaders(prepared);
  if (headers) {
    return {
      FromEmailAddress: prepared.from,
      ...shared,
      ReplyToAddresses: prepared.replyTo ? [prepared.replyTo] : undefined,
      Content: {
        Simple: {
          Subject: { Data: prepared.subject, Charset: charset },
          Body: {
            Html:
              message.html === undefined
                ? undefined
                : { Data: message.html, Charset: charset },
            Text:
              message.text === undefined
                ? undefined
                : { Data: message.text, Charset: charset },
          },
          Headers: headers.length > 0 ? headers : undefined,
        },
      },
    };
  }

  const mime = buildMime({
    from: message.from,
    to: prepared.to,
    cc: prepared.cc,
    replyTo: prepared.replyTo,
    subject: prepared.subject,
    html: message.html,
    text: message.text,
    messageId: message.messageId,
    inReplyTo: prepared.inReplyTo,
    references: prepared.references,
    headers: prepared.headers,
    date: config.now(),
    boundary: `=_${randomBytes(18).toString("hex")}`,
  });
  return {
    FromEmailAddress: prepared.fromEmail,
    ...shared,
    Content: { Raw: { Data: Buffer.from(mime, "ascii") } },
  };
}

export function sesMessageIdHeader(providerMessageId: string, region: string) {
  const host =
    region === "us-east-1" ? "email.amazonses.com" : `${region}.amazonses.com`;
  return `<${providerMessageId}@${host}>`;
}

export async function send(
  config: ResolvedSesConfig,
  credentials: Credentials,
  message: OutboundMessage,
): Promise<SendResult> {
  const access = accessKeyFrom(credentials);
  const input = toSendEmailInput(config, message);
  const output = await call<SendEmailCommandOutput>(
    config,
    access,
    new SendEmailCommand(input),
    {
      permission: input.Content?.Raw ? "ses:SendRawEmail" : "ses:SendEmail",
      from: toAsciiAddress(message.from.email),
    },
  );
  const id = output?.MessageId;
  if (typeof id !== "string" || !id) {
    throw unexpectedResponseError();
  }
  return {
    providerMessageId: id,
    messageId: sesMessageIdHeader(id, access.region),
  };
}
