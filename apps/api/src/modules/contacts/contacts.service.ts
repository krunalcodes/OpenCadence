import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { isUuid } from "../../common/uuid";
import { ListsService } from "../lists/lists.service";
import {
  type SuppressionReason,
  SuppressionService,
} from "../suppression/suppression.service";
import { TagsService } from "../tags/tags.service";
import {
  type ContactFieldDefinition,
  type ContactFieldType,
  ContactInputError,
  type CustomValue,
  contactFieldTypes,
  isReservedFieldKey,
  isValidFieldKey,
  type NormalizedContact,
  normalizeContactInput,
  slugifyFieldLabel,
  visibleFields,
  withKeySuffix,
} from "./contact-input";
import {
  type ContactCursor,
  type ContactFieldRow,
  type ContactRow,
  type ContactScope,
  ContactsRepository,
  type ContactUpsertRow,
} from "./contacts.repository";
import { compileFilter } from "./filters/filter.compiler";
import type { FilterGroup } from "./filters/filter.types";
import {
  collectFilterReferences,
  FilterValidationError,
  validateFilterGroup,
} from "./filters/filter.validator";

export type { CustomValue } from "./contact-input";
export type {
  FilterCondition,
  FilterGroup,
  TextOp,
} from "./filters/filter.types";

export type ContactOrigin = "manual" | "import" | "api" | "form";
export type ContactListStatus = "subscribed" | "unsubscribed";

export type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  fields: Record<string, CustomValue>;
  origin: ContactOrigin;
  tags: { id: string; name: string }[];
  lists: { id: string; name: string; status: ContactListStatus }[];
  suppressed: SuppressionReason | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  timezone?: string | null;
  fields?: Record<string, CustomValue>;
};

export type ContactField = {
  id: string;
  key: string;
  label: string;
  type: ContactFieldType;
  options: string[] | null;
  position: number;
  createdAt: string;
};

export type ContactScopeQuery = {
  search?: string;
  filter?: FilterGroup;
  listId?: string;
  tagId?: string;
};

export type ContactListQuery = ContactScopeQuery & {
  cursor?: string;
  limit?: number;
};

export type ContactPage = { contacts: Contact[]; nextCursor: string | null };

export type UpsertManyOptions = {
  origin: ContactOrigin;
  updateExisting: boolean;
  listIds?: string[];
  tagIds?: string[];
};

export type UpsertManyResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { index: number; message: string }[];
};

export type BulkAction =
  | "delete"
  | "add_tags"
  | "remove_tags"
  | "add_to_lists"
  | "remove_from_lists";

export const maxUpsertRows = 1000;
export const maxBulkIds = 1000;
export const maxContactFields = 100;

const origins: ContactOrigin[] = ["manual", "import", "api", "form"];
const bulkActions: BulkAction[] = [
  "delete",
  "add_tags",
  "remove_tags",
  "add_to_lists",
  "remove_from_lists",
];
const maxSearchLength = 255;
const maxAttachedIds = 50;
const maxLabelLength = 80;
const maxOptions = 50;
const maxOptionLength = 100;
const maxPosition = 10_000;
const cursorTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function contactNotFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This contact was not found. It may have been deleted.",
  );
}

function fieldNotFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This custom field was not found. It may have been deleted.",
  );
}

function emailTaken(email?: string) {
  return apiError(
    HttpStatus.CONFLICT,
    "email_taken",
    email
      ? `A contact with the address ${email} already exists.`
      : "A contact with this address already exists.",
    "email",
  );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function encodeCursor(cursor: ContactCursor) {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

function decodeCursor(value: unknown): ContactCursor | null {
  if (typeof value !== "string") {
    return null;
  }
  const [createdAt, id] = Buffer.from(value, "base64url")
    .toString("utf8")
    .split("|");
  if (
    !createdAt ||
    !cursorTimePattern.test(createdAt) ||
    Number.isNaN(Date.parse(createdAt)) ||
    !id ||
    !isUuid(id)
  ) {
    return null;
  }
  return { createdAt, id };
}

function parseIds(
  value: unknown,
  field: string,
  noun: string,
  max: number,
  required = false,
) {
  if (value === undefined || value === null) {
    if (required) {
      throw validation(`Choose at least one ${noun}.`, field);
    }
    return [];
  }
  if (!Array.isArray(value)) {
    throw validation(`${field} must be a list of ${noun} ids.`, field);
  }
  if (required && value.length === 0) {
    throw validation(`Choose at least one ${noun}.`, field);
  }
  if (value.length > max) {
    throw validation(`Choose up to ${max} ${noun}s at a time.`, field);
  }
  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !isUuid(entry)) {
      throw validation(`Every entry in ${field} must be a ${noun} id.`, field);
    }
    unique.add(entry.toLowerCase());
  }
  return [...unique];
}

function parseOptions(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw validation("Add at least one option to choose from.", "options");
  }
  if (value.length > maxOptions) {
    throw validation(`Add up to ${maxOptions} options.`, "options");
  }
  const options: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw validation("Every option must be text.", "options");
    }
    const option = entry.trim();
    if (option.length > maxOptionLength) {
      throw validation(
        `Keep each option to ${maxOptionLength} characters or fewer.`,
        "options",
      );
    }
    if (seen.has(option.toLowerCase())) {
      throw validation(
        `The option "${option}" is listed more than once.`,
        "options",
      );
    }
    seen.add(option.toLowerCase());
    options.push(option);
  }
  return options;
}

function parseLabel(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validation("Give the field a label.", "label");
  }
  const label = value.trim();
  if (label.length > maxLabelLength) {
    throw validation(
      `Keep the label to ${maxLabelLength} characters or fewer.`,
      "label",
    );
  }
  return label;
}

function toField(row: ContactFieldRow): ContactField {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type as ContactFieldType,
    options: row.type === "select" ? (row.options ?? []) : null,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCatalog(fields: ContactField[]) {
  return new Map<string, ContactFieldDefinition>(
    fields.map((field) => [field.key, field]),
  );
}

function hasChanges(contact: NormalizedContact) {
  return (
    contact.email !== undefined ||
    Object.keys(contact.columns).length > 0 ||
    Object.keys(contact.fieldsToSet).length > 0 ||
    contact.fieldsToRemove.length > 0
  );
}

@Injectable()
export class ContactsService {
  constructor(
    @Inject(ContactsRepository)
    private readonly repository: ContactsRepository,
    @Inject(ListsService) private readonly lists: ListsService,
    @Inject(TagsService) private readonly tags: TagsService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
  ) {}

  async listFields(workspaceId: string): Promise<ContactField[]> {
    const rows = await this.repository.listFields(workspaceId);
    return rows.map(toField);
  }

  validateFilter(workspaceId: string, input: unknown): Promise<FilterGroup> {
    return this.validateFilterFor(workspaceId, input, "rules");
  }

  async list(
    workspaceId: string,
    query: ContactListQuery,
  ): Promise<ContactPage> {
    const limit = Math.min(
      Math.max(Math.trunc(Number(query.limit ?? 50)) || 50, 1),
      100,
    );
    const cursor =
      query.cursor === undefined || query.cursor === null || query.cursor === ""
        ? undefined
        : decodeCursor(query.cursor);
    if (cursor === null) {
      throw validation(
        "The cursor is not valid. Start again from the first page.",
        "cursor",
      );
    }
    const catalog = toCatalog(await this.listFields(workspaceId));
    const rows = await this.repository.pageQuery({
      ...this.scope(workspaceId, query, catalog),
      cursor,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      contacts: await this.hydrate(workspaceId, page, catalog),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.cursorCreatedAt, id: last.id })
          : null,
    };
  }

  async count(workspaceId: string, query: ContactScopeQuery): Promise<number> {
    const catalog = query.filter
      ? toCatalog(await this.listFields(workspaceId))
      : new Map<string, ContactFieldDefinition>();
    return this.repository.count(this.scope(workspaceId, query, catalog));
  }

  async search(workspaceId: string, input: unknown): Promise<ContactPage> {
    const body = record(input);
    return this.list(workspaceId, {
      ...(await this.untrustedScope(workspaceId, body)),
      cursor: body.cursor as string | undefined,
      limit: body.limit as number | undefined,
    });
  }

  async countMatching(workspaceId: string, input: unknown) {
    const scope = await this.untrustedScope(workspaceId, record(input));
    return { count: await this.count(workspaceId, scope) };
  }

  async get(workspaceId: string, id: string): Promise<Contact> {
    const row = isUuid(id)
      ? await this.repository.findById(workspaceId, id)
      : null;
    if (!row) {
      throw contactNotFound();
    }
    const catalog = toCatalog(await this.listFields(workspaceId));
    const [contact] = await this.hydrate(workspaceId, [row], catalog);
    if (!contact) {
      throw contactNotFound();
    }
    return contact;
  }

  async create(
    workspaceId: string,
    origin: ContactOrigin,
    input: unknown,
  ): Promise<Contact> {
    const { listIds: rawListIds, tagIds: rawTagIds, ...rest } = record(input);
    const listIds = parseIds(rawListIds, "listIds", "list", maxAttachedIds);
    const tagIds = parseIds(rawTagIds, "tagIds", "tag", maxAttachedIds);
    const catalog = toCatalog(await this.listFields(workspaceId));
    const contact = this.normalize(rest, catalog, "create");
    await this.lists.assertExist(workspaceId, listIds);
    await this.tags.assertExist(workspaceId, tagIds);

    const email = contact.email ?? "";
    const id = await this.repository.insert(workspaceId, {
      email,
      columns: contact.columns,
      fields: contact.fieldsToSet,
      origin,
    });
    if (!id) {
      throw emailTaken(email);
    }
    if (listIds.length > 0) {
      await this.lists.addMembers(workspaceId, listIds, [id]);
    }
    if (tagIds.length > 0) {
      await this.tags.attach(workspaceId, tagIds, [id]);
    }
    return this.get(workspaceId, id);
  }

  async update(
    workspaceId: string,
    id: string,
    input: unknown,
  ): Promise<Contact> {
    if (!isUuid(id)) {
      throw contactNotFound();
    }
    const catalog = toCatalog(await this.listFields(workspaceId));
    const contact = this.normalize(record(input), catalog, "update");
    if (hasChanges(contact)) {
      const outcome = await this.repository.update(workspaceId, id, contact);
      if (outcome === "not_found") {
        throw contactNotFound();
      }
      if (outcome === "email_taken") {
        throw emailTaken(contact.email);
      }
    }
    return this.get(workspaceId, id);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const removed = isUuid(id)
      ? await this.repository.delete(workspaceId, id)
      : false;
    if (!removed) {
      throw contactNotFound();
    }
  }

  async bulk(workspaceId: string, input: unknown) {
    const body = record(input);
    const action = body.action as BulkAction;
    if (!bulkActions.includes(action)) {
      throw validation(
        `action must be one of ${bulkActions.join(", ")}.`,
        "action",
      );
    }
    const ids = parseIds(body.ids, "ids", "contact", maxBulkIds, true);
    if (action === "delete") {
      return { affected: await this.repository.deleteMany(workspaceId, ids) };
    }

    const onTags = action === "add_tags" || action === "remove_tags";
    const tagIds = onTags
      ? parseIds(body.tagIds, "tagIds", "tag", maxAttachedIds, true)
      : [];
    const listIds = onTags
      ? []
      : parseIds(body.listIds, "listIds", "list", maxAttachedIds, true);
    if (onTags) {
      await this.tags.assertExist(workspaceId, tagIds);
    } else {
      await this.lists.assertExist(workspaceId, listIds);
    }

    const existing = await this.repository.existingIds(workspaceId, ids);
    if (existing.length === 0) {
      return { affected: 0 };
    }
    if (action === "add_tags") {
      await this.tags.attach(workspaceId, tagIds, existing);
    } else if (action === "remove_tags") {
      await this.tags.detach(workspaceId, tagIds, existing);
    } else if (action === "add_to_lists") {
      await this.lists.addMembers(workspaceId, listIds, existing);
    } else {
      await this.lists.removeMembers(workspaceId, listIds, existing);
    }
    return { affected: existing.length };
  }

  async upsertMany(
    workspaceId: string,
    rows: ContactInput[],
    options: UpsertManyOptions,
  ): Promise<UpsertManyResult> {
    if (!Array.isArray(rows)) {
      throw validation("rows must be a list of contacts.", "rows");
    }
    if (rows.length > maxUpsertRows) {
      throw validation(
        `Send up to ${maxUpsertRows} contacts at a time.`,
        "rows",
      );
    }
    if (!origins.includes(options.origin)) {
      throw validation(
        `origin must be one of ${origins.join(", ")}.`,
        "origin",
      );
    }
    const listIds = parseIds(
      options.listIds,
      "listIds",
      "list",
      maxAttachedIds,
    );
    const tagIds = parseIds(options.tagIds, "tagIds", "tag", maxAttachedIds);
    await this.lists.assertExist(workspaceId, listIds);
    await this.tags.assertExist(workspaceId, tagIds);

    const result: UpsertManyResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };
    if (rows.length === 0) {
      return result;
    }
    const catalog = toCatalog(await this.listFields(workspaceId));
    const byEmail = new Map<string, ContactUpsertRow>();
    rows.forEach((row, index) => {
      try {
        const contact = normalizeContactInput(row, catalog, "create");
        const email = contact.email ?? "";
        if (byEmail.has(email)) {
          result.skipped += 1;
        }
        byEmail.set(email, {
          email,
          columns: contact.columns,
          fields: contact.fieldsToSet,
        });
      } catch (error) {
        if (!(error instanceof ContactInputError)) {
          throw error;
        }
        result.errors.push({ index, message: error.message });
      }
    });
    if (byEmail.size === 0) {
      return result;
    }

    const unique = [...byEmail.values()].sort((a, b) =>
      a.email < b.email ? -1 : a.email > b.email ? 1 : 0,
    );
    const written = await this.repository.upsertMany(
      workspaceId,
      unique,
      options.origin,
      options.updateExisting,
    );
    result.created = written.filter((row) => row.created).length;
    result.updated = written.length - result.created;
    result.skipped += unique.length - written.length;

    const contactIds = written.map((row) => row.id);
    if (contactIds.length > 0 && listIds.length > 0) {
      await this.lists.addMembers(workspaceId, listIds, contactIds);
    }
    if (contactIds.length > 0 && tagIds.length > 0) {
      await this.tags.attach(workspaceId, tagIds, contactIds);
    }
    return result;
  }

  async createField(
    workspaceId: string,
    input: unknown,
  ): Promise<ContactField> {
    const body = record(input);
    const label = parseLabel(body.label);
    const type = body.type as ContactFieldType;
    if (!contactFieldTypes.includes(type)) {
      throw validation(
        `type must be one of ${contactFieldTypes.join(", ")}.`,
        "type",
      );
    }
    let options: string[] | null = null;
    if (type === "select") {
      options = parseOptions(body.options);
    } else if (body.options !== undefined && body.options !== null) {
      throw validation("Only select fields have options.", "options");
    }

    let key: string;
    if (body.key !== undefined && body.key !== null) {
      if (typeof body.key !== "string" || !isValidFieldKey(body.key.trim())) {
        throw validation(
          "The key must start with a lower-case letter and use up to 40 lower-case letters, digits and underscores.",
          "key",
        );
      }
      key = body.key.trim();
      if (isReservedFieldKey(key)) {
        throw validation(
          `"${key}" is the name of a built-in field. Choose another key.`,
          "key",
        );
      }
    } else {
      const taken = new Set(
        (await this.repository.listFields(workspaceId)).map((row) => row.key),
      );
      const base = slugifyFieldLabel(label);
      key = base;
      for (
        let suffix = 2;
        taken.has(key) || isReservedFieldKey(key) || !isValidFieldKey(key);
        suffix += 1
      ) {
        key = withKeySuffix(base, suffix);
      }
    }

    const result = await this.repository.insertField(
      workspaceId,
      { key, label, type, options },
      maxContactFields,
    );
    if (result.ok) {
      return toField(result.row);
    }
    throw result.reason === "limit_reached"
      ? apiError(
          HttpStatus.CONFLICT,
          "limit_reached",
          `A workspace can have up to ${maxContactFields} custom fields. Delete one you no longer use to add another.`,
        )
      : apiError(
          HttpStatus.CONFLICT,
          "key_taken",
          `A custom field with the key "${key}" already exists. Choose another key.`,
          "key",
        );
  }

  async updateField(
    workspaceId: string,
    id: string,
    input: unknown,
  ): Promise<ContactField> {
    const body = record(input);
    if (body.type !== undefined || body.key !== undefined) {
      throw validation(
        "The type and key of a custom field cannot change. Create a new field instead.",
        body.type !== undefined ? "type" : "key",
      );
    }
    const current = isUuid(id)
      ? await this.repository.findField(workspaceId, id)
      : null;
    if (!current) {
      throw fieldNotFound();
    }
    const values: { label?: string; options?: string[]; position?: number } =
      {};
    if (body.label !== undefined) {
      values.label = parseLabel(body.label);
    }
    if (body.options !== undefined && body.options !== null) {
      if (current.type !== "select") {
        throw validation("Only select fields have options.", "options");
      }
      values.options = parseOptions(body.options);
    }
    if (body.position !== undefined) {
      if (
        typeof body.position !== "number" ||
        !Number.isInteger(body.position) ||
        body.position < 0 ||
        body.position > maxPosition
      ) {
        throw validation(
          `position must be a whole number from 0 to ${maxPosition}.`,
          "position",
        );
      }
      values.position = body.position;
    }
    if (Object.keys(values).length === 0) {
      return toField(current);
    }
    const row = await this.repository.updateField(workspaceId, id, values);
    if (!row) {
      throw fieldNotFound();
    }
    return toField(row);
  }

  async removeField(workspaceId: string, id: string): Promise<void> {
    const removed = isUuid(id)
      ? await this.repository.deleteField(workspaceId, id)
      : false;
    if (!removed) {
      throw fieldNotFound();
    }
  }

  private async validateFilterFor(
    workspaceId: string,
    input: unknown,
    field: string,
  ): Promise<FilterGroup> {
    const references = collectFilterReferences(input);
    const [fields, listIds, tagIds] = await Promise.all([
      this.listFields(workspaceId),
      this.repository.existingListIds(workspaceId, references.listIds),
      this.repository.existingTagIds(workspaceId, references.tagIds),
    ]);
    try {
      return validateFilterGroup(input, {
        fields: toCatalog(fields),
        listIds: new Set(listIds),
        tagIds: new Set(tagIds),
        references: "strict",
      });
    } catch (error) {
      if (error instanceof FilterValidationError) {
        throw validation(error.message, field);
      }
      throw error;
    }
  }

  private async untrustedScope(
    workspaceId: string,
    body: Record<string, unknown>,
  ): Promise<ContactScopeQuery> {
    return {
      search: body.search as string | undefined,
      listId: body.listId as string | undefined,
      tagId: body.tagId as string | undefined,
      filter:
        body.filter === undefined || body.filter === null
          ? undefined
          : await this.validateFilterFor(workspaceId, body.filter, "filter"),
    };
  }

  private scope(
    workspaceId: string,
    query: ContactScopeQuery,
    catalog: Map<string, ContactFieldDefinition>,
  ): ContactScope {
    const scope: ContactScope = { workspaceId };
    if (query.search !== undefined && query.search !== null) {
      if (typeof query.search !== "string") {
        throw validation("search must be text.", "search");
      }
      const search = query.search.trim();
      if (search.length > maxSearchLength) {
        throw validation(
          `Search with ${maxSearchLength} characters or fewer.`,
          "search",
        );
      }
      scope.search = search || undefined;
    }
    if (query.listId !== undefined && query.listId !== null) {
      if (typeof query.listId !== "string" || !isUuid(query.listId)) {
        throw validation("listId must be the id of a list.", "listId");
      }
      scope.listId = query.listId.toLowerCase();
    }
    if (query.tagId !== undefined && query.tagId !== null) {
      if (typeof query.tagId !== "string" || !isUuid(query.tagId)) {
        throw validation("tagId must be the id of a tag.", "tagId");
      }
      scope.tagId = query.tagId.toLowerCase();
    }
    if (query.filter !== undefined && query.filter !== null) {
      try {
        const filter = validateFilterGroup(query.filter, {
          fields: catalog,
          listIds: new Set(),
          tagIds: new Set(),
          references: "lenient",
        });
        scope.filter = compileFilter(filter, catalog);
      } catch (error) {
        if (error instanceof FilterValidationError) {
          throw validation(error.message, "filter");
        }
        throw error;
      }
    }
    return scope;
  }

  private normalize(
    input: unknown,
    catalog: Map<string, ContactFieldDefinition>,
    mode: "create" | "update",
  ) {
    try {
      return normalizeContactInput(input, catalog, mode);
    } catch (error) {
      if (error instanceof ContactInputError) {
        throw validation(error.message, error.field);
      }
      throw error;
    }
  }

  private async hydrate(
    workspaceId: string,
    rows: ContactRow[],
    catalog: Map<string, ContactFieldDefinition>,
  ): Promise<Contact[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const [tagRows, listRows, suppressed] = await Promise.all([
      this.repository.tagsOf(workspaceId, ids),
      this.repository.listsOf(workspaceId, ids),
      this.suppression.findBlocked(
        workspaceId,
        rows.map((row) => row.email),
        "campaign",
      ),
    ]);
    const tagsByContact = new Map<string, Contact["tags"]>();
    for (const row of tagRows) {
      const entries = tagsByContact.get(row.contactId) ?? [];
      entries.push({ id: row.id, name: row.name });
      tagsByContact.set(row.contactId, entries);
    }
    const listsByContact = new Map<string, Contact["lists"]>();
    for (const row of listRows) {
      const entries = listsByContact.get(row.contactId) ?? [];
      entries.push({
        id: row.id,
        name: row.name,
        status: row.status as ContactListStatus,
      });
      listsByContact.set(row.contactId, entries);
    }
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      company: row.company,
      jobTitle: row.jobTitle,
      phone: row.phone,
      city: row.city,
      country: row.country,
      timezone: row.timezone,
      fields: visibleFields(row.fields, catalog),
      origin: row.origin as ContactOrigin,
      tags: tagsByContact.get(row.id) ?? [],
      lists: listsByContact.get(row.id) ?? [],
      suppressed: suppressed.get(row.email) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
