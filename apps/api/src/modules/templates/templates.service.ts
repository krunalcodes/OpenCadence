import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { type MergeValues, renderMergeTags } from "@workspace/email-renderer";
import { apiError } from "../../common/api-error";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import {
  clampLimit,
  decodeKeysetCursor,
  encodeKeysetCursor,
} from "../../common/pagination/keyset-cursor";
import { isUuid } from "../../common/uuid";
import { BrandService } from "../brand/brand.service";
import { DispatchService } from "../dispatch/dispatch.service";
import { SendingSourcesService } from "../integrations/sending-sources.service";
import { isValidEmail } from "../suppression/suppression.service";
import {
  type TemplateRow,
  type TemplateSummaryRow,
  TemplatesRepository,
  type TemplateValues,
} from "./templates.repository";

export type TemplateSummary = {
  id: string;
  name: string;
  subject: string;
  previewText: string;
  createdAt: string;
  updatedAt: string;
};

export type Template = TemplateSummary & {
  document: Record<string, unknown> | null;
  html: string;
  text: string;
};

export type TemplatesQuery = {
  search?: string;
  cursor?: string;
  limit?: number;
};

const maxNameLength = 120;
const maxSubjectLength = 998;
const maxPreviewTextLength = 300;
const maxHtmlLength = 1_000_000;
const maxTextLength = 500_000;
const maxSearchLength = 200;
const defaultLimit = 30;
const maxLimit = 100;
const duplicateAttempts = 5;
const testSubjectPrefix = "[Test]";

const sampleContact: MergeValues = {
  email: "ada@example.com",
  first_name: "Ada",
  last_name: "Lovelace",
  company: "Northwind",
  job_title: "Head of Engineering",
  phone: "+1 555 0100",
  city: "London",
  country: "United Kingdom",
};

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This template was not found. It may have been deleted.",
  );
}

function nameTaken() {
  return apiError(
    HttpStatus.CONFLICT,
    "name_taken",
    "A template with this name already exists. Choose another name.",
    "name",
  );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function userOf(context: WorkspaceAuthContext) {
  return context.method === "session" ? context.userId : null;
}

function parseName(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validation("Give the template a name.", "name");
  }
  const name = value.trim();
  if (name.length > maxNameLength || /[\r\n\0]/.test(name)) {
    throw validation(
      `Keep the name to one line of ${maxNameLength} characters or fewer.`,
      "name",
    );
  }
  return name;
}

function parseLine(value: unknown, field: string, label: string, max: number) {
  if (typeof value !== "string") {
    throw validation(`${field} must be text.`, field);
  }
  const line = value.trim();
  if (line.length > max || /[\r\n\0]/.test(line)) {
    throw validation(
      `Keep ${label} to one line of ${max} characters or fewer.`,
      field,
    );
  }
  return line;
}

function parseContent(value: unknown, field: string, max: number) {
  if (typeof value !== "string") {
    throw validation(`${field} must be text.`, field);
  }
  if (value.length > max) {
    throw validation(
      `The ${field} content is longer than ${max.toLocaleString("en-US")} characters.`,
      field,
    );
  }
  if (value.includes("\0")) {
    throw validation(`The ${field} content contains a null character.`, field);
  }
  return value;
}

function parseDocument(value: unknown) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw validation("document must be an object or null.", "document");
  }
  if (/(?<!\\)(?:\\\\)*\\u0000/.test(JSON.stringify(value))) {
    throw validation("document contains a null character.", "document");
  }
  return value as Record<string, unknown>;
}

function parseValues(body: Record<string, unknown>) {
  const values: Partial<TemplateValues> = {};
  if (body.name !== undefined) {
    values.name = parseName(body.name);
  }
  if (body.subject !== undefined) {
    values.subject = parseLine(
      body.subject,
      "subject",
      "the subject",
      maxSubjectLength,
    );
  }
  if (body.previewText !== undefined) {
    values.previewText = parseLine(
      body.previewText,
      "previewText",
      "the preview text",
      maxPreviewTextLength,
    );
  }
  if (body.document !== undefined) {
    values.document = parseDocument(body.document);
  }
  if (body.html !== undefined) {
    values.html = parseContent(body.html, "html", maxHtmlLength);
  }
  if (body.text !== undefined) {
    values.text = parseContent(body.text, "text", maxTextLength);
  }
  return values;
}

function copyName(name: string, taken: Set<string>) {
  for (let number = 1; ; number += 1) {
    const suffix = number === 1 ? " copy" : ` copy ${number}`;
    const candidate = `${name.slice(0, maxNameLength - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

function toSummary(row: TemplateSummaryRow | TemplateRow): TemplateSummary {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    previewText: row.previewText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTemplate(row: TemplateRow): Template {
  return {
    ...toSummary(row),
    document: row.document,
    html: row.html,
    text: row.text,
  };
}

@Injectable()
export class TemplatesService {
  constructor(
    @Inject(TemplatesRepository)
    private readonly repository: TemplatesRepository,
    @Inject(BrandService) private readonly brand: BrandService,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
  ) {}

  async list(
    workspaceId: string,
    query: TemplatesQuery,
  ): Promise<{ items: TemplateSummary[]; nextCursor: string | null }> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : undefined;
    if (cursor === null) {
      throw validation(
        "The cursor is not valid. Start again from the first page.",
        "cursor",
      );
    }
    const search = query.search?.trim().slice(0, maxSearchLength);
    const limit = clampLimit(query.limit, defaultLimit, maxLimit);
    const rows = await this.repository.list(workspaceId, {
      search: search || undefined,
      cursor,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toSummary),
      nextCursor:
        rows.length > limit && last
          ? encodeKeysetCursor({ at: last.cursorAt, id: last.id })
          : null,
    };
  }

  async get(workspaceId: string, id: string): Promise<Template> {
    return toTemplate(await this.require(workspaceId, id));
  }

  async create(context: WorkspaceAuthContext, input: unknown) {
    const values = parseValues(record(input));
    const result = await this.repository.insert(
      context.workspaceId,
      {
        name: parseName(values.name),
        subject: values.subject ?? "",
        previewText: values.previewText ?? "",
        document: values.document ?? null,
        html: values.html ?? "",
        text: values.text ?? "",
      },
      userOf(context),
    );
    if (!result.ok) {
      throw result.reason === "name_taken" ? nameTaken() : notFound();
    }
    return toTemplate(result.row);
  }

  async update(context: WorkspaceAuthContext, id: string, input: unknown) {
    const values = parseValues(record(input));
    if (!isUuid(id)) {
      throw notFound();
    }
    if (Object.keys(values).length === 0) {
      return this.get(context.workspaceId, id);
    }
    const result = await this.repository.update(
      context.workspaceId,
      id,
      values,
      userOf(context),
    );
    if (!result.ok) {
      throw result.reason === "name_taken" ? nameTaken() : notFound();
    }
    return toTemplate(result.row);
  }

  async duplicate(context: WorkspaceAuthContext, id: string) {
    const source = await this.require(context.workspaceId, id);
    const prefix = source.name.slice(0, maxNameLength - " copy 999".length);
    for (let attempt = 0; attempt < duplicateAttempts; attempt += 1) {
      const names = await this.repository.namesStartingWith(
        context.workspaceId,
        prefix,
      );
      const result = await this.repository.insert(
        context.workspaceId,
        {
          name: copyName(
            source.name,
            new Set(names.map((name) => name.toLowerCase())),
          ),
          subject: source.subject,
          previewText: source.previewText,
          document: source.document,
          html: source.html,
          text: source.text,
        },
        userOf(context),
      );
      if (result.ok) {
        return toTemplate(result.row);
      }
    }
    throw nameTaken();
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const removed = isUuid(id)
      ? await this.repository.delete(workspaceId, id)
      : false;
    if (!removed) {
      throw notFound();
    }
  }

  async sendTest(workspaceId: string, input: unknown) {
    const body = record(input);
    if (typeof body.to !== "string" || !isValidEmail(body.to.trim())) {
      throw validation("Enter the address to send the test to.", "to");
    }
    const subject =
      body.subject === undefined || body.subject === null
        ? ""
        : parseLine(body.subject, "subject", "the subject", maxSubjectLength);
    const html = parseContent(body.html, "html", maxHtmlLength);
    if (html.trim() === "") {
      throw validation("Add some content before sending a test.", "html");
    }
    const text =
      body.text === undefined || body.text === null
        ? null
        : parseContent(body.text, "text", maxTextLength);
    let sourceId: string | undefined;
    if (body.sourceId !== undefined && body.sourceId !== null) {
      if (typeof body.sourceId !== "string" || !isUuid(body.sourceId)) {
        throw validation("sourceId is not a valid id.", "sourceId");
      }
      sourceId = body.sourceId;
    }

    const source = await this.sources.resolveForSend(workspaceId, sourceId);
    let from = source.email;
    if (!from) {
      if (typeof body.from !== "string" || !isValidEmail(body.from.trim())) {
        throw validation(
          `${source.name} has no fixed address. Enter a From address on a domain that is verified in that account.`,
          "from",
        );
      }
      from = body.from.trim();
    }

    const brand = await this.brand.get(workspaceId);
    const values: MergeValues = {
      ...sampleContact,
      "brand.name": brand.brandName,
      "brand.address": brand.postalAddress,
      "brand.website": brand.websiteUrl,
      unsubscribe_url: "#",
    };
    const renderedSubject = renderMergeTags(subject, values)
      .replace(/\s+/g, " ")
      .trim();
    const message = await this.dispatch.enqueue({
      workspaceId,
      kind: "transactional",
      sourceId: source.id,
      from: {
        email: from,
        name: brand.brandName.replace(/[\r\n]+/g, " ").trim() || null,
      },
      to: [body.to.trim()],
      subject: `${testSubjectPrefix} ${renderedSubject}`
        .trim()
        .slice(0, maxSubjectLength),
      html: renderMergeTags(html, values, { escape: "html" }),
      text: text ? renderMergeTags(text, values) : null,
      tags: { purpose: "template_test" },
    });
    return {
      messageId: message.id,
      status: message.status,
      suppressed: message.suppressed,
    };
  }

  private async require(workspaceId: string, id: string) {
    const row = isUuid(id) ? await this.repository.find(workspaceId, id) : null;
    if (!row) {
      throw notFound();
    }
    return row;
  }
}
