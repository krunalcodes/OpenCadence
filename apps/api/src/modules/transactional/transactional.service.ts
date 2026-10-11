import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { isUuid } from "../../common/uuid";
import {
  DispatchService,
  type MessagesQuery,
} from "../dispatch/dispatch.service";
import { isValidEmail } from "../suppression/suppression.service";

const maxRecipients = 50;
const maxSubjectLength = 998;
const maxContentBytes = 1024 * 1024;
const maxHeaders = 50;
const maxTags = 20;
const addressPattern = /^\s*(?:"?([^"<>]*?)"?\s*)?<([^<>\s]+)>\s*$/;
const headerNamePattern = /^[A-Za-z0-9-]{1,100}$/;
const tagPattern = /^[A-Za-z0-9_-]{1,256}$/;
const reservedHeaders = [
  "from",
  "to",
  "cc",
  "bcc",
  "subject",
  "date",
  "message-id",
  "content-type",
  "content-transfer-encoding",
  "mime-version",
  "return-path",
  "dkim-signature",
];

function invalid(field: string, message: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseFrom(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid(
      "from",
      "Send from as an address, or a name and address like Ada <ada@example.com>.",
    );
  }
  const match = addressPattern.exec(value);
  const email = (match ? match[2] : value).trim();
  const name = match?.[1]?.trim() || null;
  if (!isValidEmail(email)) {
    throw invalid("from", `${email} is not a valid From address.`);
  }
  if (name && /[\r\n]/.test(name)) {
    throw invalid("from", "The From name cannot contain line breaks.");
  }
  return { email, name };
}

function parseAddresses(value: unknown, field: string, required: boolean) {
  const list =
    typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  if (
    value !== undefined &&
    typeof value !== "string" &&
    !Array.isArray(value)
  ) {
    throw invalid(field, `Send ${field} as an address or a list of addresses.`);
  }
  if (required && list.length === 0) {
    throw invalid(field, "Add at least one recipient.");
  }
  const emails: string[] = [];
  for (const item of list) {
    if (typeof item !== "string" || !isValidEmail(item.trim())) {
      throw invalid(field, `${String(item)} is not a valid email address.`);
    }
    emails.push(item.trim());
  }
  return emails;
}

function parseStringMap(
  value: unknown,
  field: string,
  max: number,
  check: (name: string, entry: string) => string | null,
) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw invalid(field, `Send ${field} as an object of text values.`);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > max) {
    throw invalid(field, `Send at most ${max} ${field}.`);
  }
  const result: Record<string, string> = {};
  for (const [name, entry] of entries) {
    if (typeof entry !== "string") {
      throw invalid(field, `The value of ${name} must be text.`);
    }
    const problem = check(name, entry);
    if (problem) {
      throw invalid(field, problem);
    }
    result[name] = entry;
  }
  return result;
}

@Injectable()
export class TransactionalService {
  constructor(
    @Inject(DispatchService) private readonly dispatch: DispatchService,
  ) {}

  async send(workspaceId: string, input: unknown, idempotencyKey?: string) {
    const body = record(input);
    const from = parseFrom(body.from);
    const to = parseAddresses(body.to, "to", true);
    const cc = parseAddresses(body.cc, "cc", false);
    const bcc = parseAddresses(body.bcc, "bcc", false);
    if (to.length + cc.length + bcc.length > maxRecipients) {
      throw invalid(
        "to",
        `Send to at most ${maxRecipients} recipients in one email, counting cc and bcc.`,
      );
    }

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    if (
      subject === "" ||
      subject.length > maxSubjectLength ||
      /[\r\n]/.test(subject)
    ) {
      throw invalid(
        "subject",
        `Add a subject of 1 to ${maxSubjectLength} characters on one line.`,
      );
    }

    const html = typeof body.html === "string" ? body.html : null;
    const text = typeof body.text === "string" ? body.text : null;
    if (!html && !text) {
      throw invalid("html", "Add the email content as html, text, or both.");
    }
    if (
      Buffer.byteLength(html ?? "") + Buffer.byteLength(text ?? "") >
      maxContentBytes
    ) {
      throw invalid("html", "The email content is larger than 1 MB.");
    }

    let replyTo: string | null = null;
    if (body.replyTo !== undefined && body.replyTo !== null) {
      if (
        typeof body.replyTo !== "string" ||
        !isValidEmail(body.replyTo.trim())
      ) {
        throw invalid("replyTo", "replyTo is not a valid email address.");
      }
      replyTo = body.replyTo.trim();
    }

    const headers = parseStringMap(
      body.headers,
      "headers",
      maxHeaders,
      (name, entry) => {
        if (!headerNamePattern.test(name)) {
          return `${name} is not a valid header name.`;
        }
        if (reservedHeaders.includes(name.toLowerCase())) {
          return `The ${name} header is set by OpenCadence and cannot be overridden.`;
        }
        return /[\r\n]/.test(entry) || entry.length > 2000
          ? `The ${name} header must be one line of at most 2,000 characters.`
          : null;
      },
    );
    const tags = parseStringMap(body.tags, "tags", maxTags, (name, entry) =>
      tagPattern.test(name) && tagPattern.test(entry)
        ? null
        : `Tag ${name} may only use letters, digits, underscores and hyphens, up to 256 characters.`,
    );

    let sourceId: string | undefined;
    if (body.sourceId !== undefined && body.sourceId !== null) {
      if (typeof body.sourceId !== "string" || !isUuid(body.sourceId)) {
        throw invalid("sourceId", "sourceId is not a valid id.");
      }
      sourceId = body.sourceId;
    }

    const key = idempotencyKey?.trim();
    if (key !== undefined && (key.length < 1 || key.length > 256)) {
      throw invalid(
        "Idempotency-Key",
        "The Idempotency-Key header must be 1 to 256 characters.",
      );
    }

    const message = await this.dispatch.enqueue({
      workspaceId,
      kind: "transactional",
      sourceId,
      from,
      to,
      cc,
      bcc,
      replyTo,
      subject,
      html,
      text,
      headers,
      tags,
      idempotencyKey: key,
    });
    return {
      id: message.id,
      status: message.status,
      createdAt: message.createdAt,
      suppressed: message.suppressed,
    };
  }

  list(workspaceId: string, query: MessagesQuery) {
    return this.dispatch.list(workspaceId, query);
  }

  get(workspaceId: string, id: string) {
    return this.dispatch.get(workspaceId, id);
  }
}
