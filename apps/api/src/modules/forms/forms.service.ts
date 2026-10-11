import { randomInt } from "node:crypto";
import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { apiError } from "../../common/api-error";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import {
  clampLimit,
  decodeKeysetCursor,
  encodeKeysetCursor,
} from "../../common/pagination/keyset-cursor";
import { isUuid } from "../../common/uuid";
import type { Env } from "../../config/env";
import { TrackingKeys } from "../../infra/tracking-keys/tracking-keys";
import { ContactsService } from "../contacts/contacts.service";
import { SendingSourcesService } from "../integrations/sending-sources.service";
import { ListsService } from "../lists/lists.service";
import { escapeHtml } from "./confirmation-email";
import {
  type CatalogField,
  type FormField,
  FormInputError,
  type FormSettings,
  parseFields,
  parseName,
  parseSettings,
  resolveFields,
  resolveSettings,
} from "./form-input";
import {
  type FormStatus,
  honeypotField,
  type SubmissionStatus,
  submissionStatuses,
} from "./forms.constants";
import {
  type FormRow,
  FormsRepository,
  type FormValues,
  isPublicIdTaken,
  type SubmissionRow,
} from "./forms.repository";

export type FormSummary = {
  id: string;
  name: string;
  status: FormStatus;
  publicId: string;
  url: string;
  doubleOptIn: boolean;
  lists: { id: string; name: string }[];
  submissionCount: number;
  confirmedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Form = FormSummary & {
  fields: FormField[];
  settings: FormSettings;
  source: { id: string; name: string } | null;
  embed: { url: string; iframe: string; html: string };
};

export type Submission = {
  id: string;
  email: string;
  data: Record<string, string>;
  status: SubmissionStatus;
  contactId: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type FormProblem = { code: string; field: string; message: string };

export type FormSender = { sourceId: string; fromEmail: string };

type ListName = { id: string; name: string };

const maxListIds = 20;
const publicIdLength = 16;
const publicIdAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
const publicIdAttempts = 5;
const defaultPageSize = 50;
const maxPageSize = 100;

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This form was not found. It may have been deleted.",
  );
}

function nameTaken() {
  return apiError(
    HttpStatus.CONFLICT,
    "name_taken",
    "A form with this name already exists. Choose another name.",
    "name",
  );
}

function notReady(problems: FormProblem[]) {
  return new HttpException(
    {
      statusCode: HttpStatus.CONFLICT,
      code: "form_not_ready",
      message:
        problems[0]?.message ?? "This form is not ready to be published.",
      field: problems[0]?.field,
      problems,
    },
    HttpStatus.CONFLICT,
  );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parsed<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof FormInputError) {
      throw validation(error.message, error.field);
    }
    throw error;
  }
}

function newPublicId() {
  let id = "";
  for (let index = 0; index < publicIdLength; index += 1) {
    id += publicIdAlphabet[randomInt(publicIdAlphabet.length)];
  }
  return id;
}

function parseListIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw validation("listIds must be a list of list ids.", "listIds");
  }
  if (value.length > maxListIds) {
    throw validation(`Choose up to ${maxListIds} lists.`, "listIds");
  }
  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !isUuid(entry)) {
      throw validation("Every entry in listIds must be a list id.", "listIds");
    }
    unique.add(entry.toLowerCase());
  }
  return [...unique];
}

export function toSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    email: row.email,
    data: row.data ?? {},
    status: row.status as SubmissionStatus,
    contactId: row.contactId,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
  };
}

function fieldControl(field: FormField, id: string) {
  const name = escapeHtml(field.key);
  const required = field.required ? " required" : "";
  if (field.type === "select") {
    const options = (field.options ?? [])
      .map(
        (option) =>
          `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`,
      )
      .join("");
    return `<select id="${id}" name="${name}"${required}><option value=""></option>${options}</select>`;
  }
  if (field.type === "boolean") {
    return `<input id="${id}" name="${name}" type="checkbox" value="true"${required} />`;
  }
  const type = field.type === "text" ? "text" : field.type;
  const limit = field.type === "email" ? 320 : 500;
  return `<input id="${id}" name="${name}" type="${type}" maxlength="${limit}"${required} />`;
}

export function embedHtml(input: {
  action: string;
  publicId: string;
  fields: FormField[];
  settings: FormSettings;
}) {
  const rows = input.fields.map((field, index) => {
    const id = `oc-${input.publicId}-${index}`;
    return `  <p><label for="${id}">${escapeHtml(field.label)}</label><br />${fieldControl(field, id)}</p>`;
  });
  return [
    `<form action="${escapeHtml(input.action)}" method="post" accept-charset="utf-8">`,
    ...rows,
    `  <div aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;"><label>Leave this empty <input type="text" name="${honeypotField}" tabindex="-1" autocomplete="off" /></label></div>`,
    `  <p><small>${escapeHtml(input.settings.consentText)}</small></p>`,
    `  <p><button type="submit">${escapeHtml(input.settings.buttonLabel)}</button></p>`,
    "</form>",
  ].join("\n");
}

@Injectable()
export class FormsService {
  private readonly appUrl: string;

  constructor(
    @Inject(FormsRepository) private readonly repository: FormsRepository,
    @Inject(ListsService) private readonly lists: ListsService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(TrackingKeys) private readonly keys: TrackingKeys,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.appUrl = config
      .get("BETTER_AUTH_URL", { infer: true })
      .trim()
      .replace(/\/+$/, "");
  }

  formUrl(publicId: string) {
    return `${this.appUrl}/f/${publicId}`;
  }

  confirmUrl(token: string) {
    return `${this.appUrl}/f/confirm/${token}`;
  }

  submitUrl(publicId: string) {
    return `${this.keys.baseUrl.replace(/\/+$/, "")}/public/forms/${publicId}/submit`;
  }

  async catalog(workspaceId: string): Promise<Map<string, CatalogField>> {
    const fields = await this.contacts.listFields(workspaceId);
    return new Map(
      fields.map((field) => [
        field.key,
        {
          key: field.key,
          label: field.label,
          type: field.type,
          options: field.options,
        },
      ]),
    );
  }

  async list(workspaceId: string): Promise<{ forms: FormSummary[] }> {
    const [rows, lists] = await Promise.all([
      this.repository.list(workspaceId),
      this.lists.catalog(workspaceId),
    ]);
    return { forms: rows.map((row) => this.toSummary(row, lists)) };
  }

  async create(context: WorkspaceAuthContext, input: unknown): Promise<Form> {
    const name = parsed(() => parseName(record(input).name));
    for (let attempt = 0; attempt < publicIdAttempts; attempt += 1) {
      try {
        const result = await this.repository.insert(context.workspaceId, {
          name,
          publicId: newPublicId(),
          fields: [{ key: "email", label: "Email", required: true }],
          createdByUserId: context.method === "session" ? context.userId : null,
        });
        if (!result.ok) {
          throw result.reason === "name_taken" ? nameTaken() : notFound();
        }
        return this.toForm(result.row);
      } catch (error) {
        if (!isPublicIdTaken(error)) {
          throw error;
        }
      }
    }
    throw apiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "unavailable",
      "The form could not be created. Try again.",
    );
  }

  async get(workspaceId: string, id: string): Promise<Form> {
    return this.toForm(await this.require(workspaceId, id));
  }

  async update(workspaceId: string, id: string, input: unknown): Promise<Form> {
    const body = record(input);
    const row = await this.require(workspaceId, id);
    const values: FormValues = {};
    if (body.name !== undefined) {
      values.name = parsed(() => parseName(body.name));
    }
    if (body.doubleOptIn !== undefined) {
      if (typeof body.doubleOptIn !== "boolean") {
        throw validation("doubleOptIn must be true or false.", "doubleOptIn");
      }
      values.doubleOptIn = body.doubleOptIn;
    }
    if (body.listIds !== undefined) {
      values.listIds = parseListIds(body.listIds);
      await this.lists.assertExist(workspaceId, values.listIds);
    }
    if (body.fields !== undefined) {
      const catalog = await this.catalog(workspaceId);
      values.fields = parsed(() => parseFields(body.fields, catalog));
    }
    if (body.settings !== undefined) {
      values.settings = parsed(() =>
        parseSettings(body.settings, row.settings),
      );
    }
    if (body.sourceId !== undefined) {
      values.sourceId = await this.parseSourceId(workspaceId, body.sourceId);
    }
    if (Object.keys(values).length === 0) {
      return this.toForm(row);
    }
    if (row.status === "published") {
      const problems = await this.problems({ ...row, ...values });
      if (problems.length > 0) {
        throw notReady(problems);
      }
    }
    return this.toForm(await this.write(workspaceId, id, values));
  }

  async publish(workspaceId: string, id: string): Promise<Form> {
    const row = await this.require(workspaceId, id);
    const problems = await this.problems(row);
    if (problems.length > 0) {
      throw notReady(problems);
    }
    return this.setStatus(row, "published");
  }

  async unpublish(workspaceId: string, id: string): Promise<Form> {
    return this.setStatus(await this.require(workspaceId, id), "draft");
  }

  async archive(workspaceId: string, id: string): Promise<Form> {
    return this.setStatus(await this.require(workspaceId, id), "archived");
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const removed = isUuid(id)
      ? await this.repository.delete(workspaceId, id)
      : false;
    if (!removed) {
      throw notFound();
    }
  }

  async listSubmissions(
    workspaceId: string,
    id: string,
    query: { status?: unknown; cursor?: unknown; limit?: unknown },
  ): Promise<{ items: Submission[]; nextCursor: string | null }> {
    const form = await this.require(workspaceId, id);
    let status: SubmissionStatus | undefined;
    if (query.status !== undefined && query.status !== "") {
      if (!submissionStatuses.includes(query.status as SubmissionStatus)) {
        throw validation(
          `status must be one of ${submissionStatuses.join(", ")}.`,
          "status",
        );
      }
      status = query.status as SubmissionStatus;
    }
    const cursor =
      query.cursor === undefined || query.cursor === ""
        ? undefined
        : typeof query.cursor === "string"
          ? decodeKeysetCursor(query.cursor)
          : null;
    if (cursor === null) {
      throw validation(
        "The cursor is not valid. Start again from the first page.",
        "cursor",
      );
    }
    const limit = clampLimit(
      query.limit === undefined || query.limit === ""
        ? undefined
        : Number(query.limit),
      defaultPageSize,
      maxPageSize,
    );
    const rows = await this.repository.listSubmissions(workspaceId, form.id, {
      status,
      cursor,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => toSubmission(row.submission)),
      nextCursor:
        rows.length > limit && last
          ? encodeKeysetCursor({ at: last.cursorAt, id: last.submission.id })
          : null,
    };
  }

  async resolveSender(
    row: Pick<FormRow, "workspaceId" | "sourceId" | "settings">,
  ): Promise<{ sender: FormSender } | { problem: FormProblem }> {
    let source: Awaited<ReturnType<SendingSourcesService["resolveForSend"]>>;
    try {
      source = await this.sources.resolveForSend(
        row.workspaceId,
        row.sourceId ?? undefined,
      );
    } catch (error) {
      if (!(error instanceof HttpException)) {
        throw error;
      }
      return {
        problem: row.sourceId
          ? {
              code: "source_missing",
              field: "sourceId",
              message:
                "The sending source chosen for the confirmation email no longer exists. Choose another one.",
            }
          : {
              code: "no_source",
              field: "sourceId",
              message:
                "Double opt-in sends a confirmation email. Connect a sending source, set a default one, or choose one for this form.",
            },
      };
    }
    if (source.status !== "active") {
      return {
        problem: {
          code:
            source.status === "paused"
              ? "source_paused"
              : "source_needs_attention",
          field: "sourceId",
          message:
            source.status === "paused"
              ? `${source.name} is paused, so it cannot send the confirmation email. Resume it or choose another source.`
              : `${source.name} needs attention before it can send the confirmation email. Fix it on the Integrations page.`,
        },
      };
    }
    const fromEmail =
      source.email || resolveSettings(row.settings, true).fromEmail;
    if (!fromEmail) {
      return {
        problem: {
          code: "from_missing",
          field: "settings.fromEmail",
          message: `${source.name} has no fixed address. Enter a From address on a domain that is verified in that account.`,
        },
      };
    }
    return { sender: { sourceId: source.id, fromEmail } };
  }

  async problems(
    row: Pick<
      FormRow,
      "workspaceId" | "sourceId" | "settings" | "listIds" | "doubleOptIn"
    >,
  ): Promise<FormProblem[]> {
    const problems: FormProblem[] = [];
    const lists = await this.lists.catalog(row.workspaceId);
    if (this.listsOf(row.listIds, lists).length === 0) {
      problems.push({
        code: "no_lists",
        field: "listIds",
        message: "Choose at least one list for new subscribers to join.",
      });
    }
    if (row.doubleOptIn) {
      const resolved = await this.resolveSender(row);
      if ("problem" in resolved) {
        problems.push(resolved.problem);
      }
    }
    return problems;
  }

  toPublicFields(row: FormRow, catalog: Map<string, CatalogField>) {
    return resolveFields(row.fields, catalog);
  }

  private listsOf(listIds: string[], lists: ListName[]) {
    const byId = new Map(lists.map((list) => [list.id, list.name]));
    return listIds.flatMap((id) => {
      const name = byId.get(id);
      return name === undefined ? [] : [{ id, name }];
    });
  }

  private async parseSourceId(workspaceId: string, value: unknown) {
    if (value === null || value === "") {
      return null;
    }
    if (typeof value !== "string" || !isUuid(value)) {
      throw validation("sourceId is not a valid id.", "sourceId");
    }
    try {
      return (await this.sources.resolveForSend(workspaceId, value)).id;
    } catch (error) {
      if (error instanceof HttpException) {
        throw validation(
          "This sending source does not exist in the workspace.",
          "sourceId",
        );
      }
      throw error;
    }
  }

  private async require(workspaceId: string, id: string) {
    const row = isUuid(id) ? await this.repository.find(workspaceId, id) : null;
    if (!row) {
      throw notFound();
    }
    return row;
  }

  private async write(workspaceId: string, id: string, values: FormValues) {
    const result = await this.repository.update(workspaceId, id, values);
    if (!result.ok) {
      throw result.reason === "name_taken" ? nameTaken() : notFound();
    }
    return result.row;
  }

  private async setStatus(row: FormRow, status: FormStatus) {
    return this.toForm(
      row.status === status
        ? row
        : await this.write(row.workspaceId, row.id, { status }),
    );
  }

  private toSummary(row: FormRow, lists: ListName[]): FormSummary {
    return {
      id: row.id,
      name: row.name,
      status: row.status as FormStatus,
      publicId: row.publicId,
      url: this.formUrl(row.publicId),
      doubleOptIn: row.doubleOptIn,
      lists: this.listsOf(row.listIds, lists),
      submissionCount: row.submissionCount,
      confirmedCount: row.confirmedCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async toForm(row: FormRow): Promise<Form> {
    const [lists, catalog, source] = await Promise.all([
      this.lists.catalog(row.workspaceId),
      this.catalog(row.workspaceId),
      this.sourceOf(row),
    ]);
    const fields = resolveFields(row.fields, catalog);
    const settings = resolveSettings(row.settings, row.doubleOptIn);
    const url = this.formUrl(row.publicId);
    return {
      ...this.toSummary(row, lists),
      fields,
      settings,
      source,
      embed: {
        url,
        iframe: `<iframe src="${escapeHtml(`${url}?embed=1`)}" title="${escapeHtml(row.name)}" width="100%" height="480" loading="lazy" style="border:0;max-width:480px;"></iframe>`,
        html: embedHtml({
          action: this.submitUrl(row.publicId),
          publicId: row.publicId,
          fields,
          settings,
        }),
      },
    };
  }

  private async sourceOf(row: FormRow) {
    if (!row.sourceId) {
      return null;
    }
    try {
      const source = await this.sources.resolveForSend(
        row.workspaceId,
        row.sourceId,
      );
      return { id: source.id, name: source.name };
    } catch (error) {
      if (error instanceof HttpException) {
        return null;
      }
      throw error;
    }
  }
}
