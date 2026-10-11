import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { isUuid } from "../../common/uuid";
import {
  type ListCatalogRow,
  type ListMemberStatus,
  type ListRow,
  ListsRepository,
  type ListValues,
} from "./lists.repository";

export type { ListMemberStatus } from "./lists.repository";

export type List = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  publicName: string | null;
  publicDescription: string | null;
  subscribedCount: number;
  unsubscribedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ListCatalogEntry = ListCatalogRow;

export type ListInput = {
  name?: unknown;
  description?: unknown;
  isPublic?: unknown;
  publicName?: unknown;
  publicDescription?: unknown;
};

const maxNameLength = 80;
const maxDescriptionLength = 500;
const maxContactIds = 1000;
const memberStatuses: ListMemberStatus[] = ["subscribed", "unsubscribed"];

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This list was not found. It may have been deleted.",
  );
}

function nameTaken() {
  return apiError(
    HttpStatus.CONFLICT,
    "name_taken",
    "A list with this name already exists. Choose another name.",
    "name",
  );
}

function parseName(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validation("Give the list a name.", "name");
  }
  const name = value.trim();
  if (name.length > maxNameLength) {
    throw validation(
      `Keep the name to ${maxNameLength} characters or fewer.`,
      "name",
    );
  }
  return name;
}

function parseDescription(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw validation("description must be text.", "description");
  }
  const description = value.trim();
  if (description.length > maxDescriptionLength) {
    throw validation(
      `Keep the description to ${maxDescriptionLength} characters or fewer.`,
      "description",
    );
  }
  return description || null;
}

function parseIsPublic(value: unknown) {
  if (typeof value !== "boolean") {
    throw validation("isPublic must be true or false.", "isPublic");
  }
  return value;
}

function parsePublicName(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw validation("publicName must be text.", "publicName");
  }
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length > maxNameLength) {
    throw validation(
      `Keep the public name to ${maxNameLength} characters or fewer.`,
      "publicName",
    );
  }
  return name || null;
}

function parsePublicDescription(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw validation("publicDescription must be text.", "publicDescription");
  }
  const description = value.trim();
  if (description.length > maxDescriptionLength) {
    throw validation(
      `Keep the public description to ${maxDescriptionLength} characters or fewer.`,
      "publicDescription",
    );
  }
  return description || null;
}

function parsePublicFields(input: ListInput) {
  const values: Partial<ListValues> = {};
  if (input.isPublic !== undefined) {
    values.isPublic = parseIsPublic(input.isPublic);
  }
  if (input.publicName !== undefined) {
    values.publicName = parsePublicName(input.publicName);
  }
  if (input.publicDescription !== undefined) {
    values.publicDescription = parsePublicDescription(input.publicDescription);
  }
  return values;
}

function uniqueIds(values: string[], field: string, noun: string) {
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" || !isUuid(value)) {
      throw validation(`Every entry must be a ${noun} id.`, field);
    }
    unique.add(value.toLowerCase());
  }
  return [...unique];
}

function parseContactIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw validation("Choose at least one contact.", "contactIds");
  }
  if (value.length > maxContactIds) {
    throw validation(
      `Choose up to ${maxContactIds} contacts at a time.`,
      "contactIds",
    );
  }
  return uniqueIds(value, "contactIds", "contact");
}

function toList(row: ListRow): List {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isPublic: row.isPublic,
    publicName: row.publicName,
    publicDescription: row.publicDescription,
    subscribedCount: row.subscribedCount,
    unsubscribedCount: row.unsubscribedCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ListsService {
  constructor(
    @Inject(ListsRepository) private readonly repository: ListsRepository,
  ) {}

  async list(workspaceId: string): Promise<{ lists: List[] }> {
    const rows = await this.repository.listWithCounts(workspaceId);
    return { lists: rows.map(toList) };
  }

  async get(workspaceId: string, id: string): Promise<List> {
    const row = isUuid(id)
      ? await this.repository.findWithCounts(workspaceId, id)
      : null;
    if (!row) {
      throw notFound();
    }
    return toList(row);
  }

  catalog(workspaceId: string): Promise<ListCatalogEntry[]> {
    return this.repository.catalog(workspaceId);
  }

  async create(workspaceId: string, input: ListInput): Promise<List> {
    const result = await this.repository.insert(workspaceId, {
      name: parseName(input.name),
      description: parseDescription(input.description),
      ...parsePublicFields(input),
    });
    if (!result.ok) {
      throw result.reason === "name_taken" ? nameTaken() : notFound();
    }
    return this.get(workspaceId, result.id);
  }

  async update(
    workspaceId: string,
    id: string,
    input: ListInput,
  ): Promise<List> {
    const values: Partial<ListValues> = parsePublicFields(input);
    if (input.name !== undefined) {
      values.name = parseName(input.name);
    }
    if (input.description !== undefined) {
      values.description = parseDescription(input.description);
    }
    if (!isUuid(id)) {
      throw notFound();
    }
    if (Object.keys(values).length > 0) {
      const result = await this.repository.update(workspaceId, id, values);
      if (!result.ok) {
        throw result.reason === "name_taken" ? nameTaken() : notFound();
      }
    }
    return this.get(workspaceId, id);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const removed = isUuid(id)
      ? await this.repository.delete(workspaceId, id)
      : false;
    if (!removed) {
      throw notFound();
    }
  }

  async assertExist(workspaceId: string, listIds: string[]): Promise<void> {
    const ids = uniqueIds(listIds, "listIds", "list");
    if (ids.length === 0) {
      return;
    }
    const found = await this.repository.findExistingIds(workspaceId, ids);
    if (found.length !== ids.length) {
      throw validation(
        "One or more lists were not found. They may have been deleted.",
        "listIds",
      );
    }
  }

  async addMembers(
    workspaceId: string,
    listIds: string[],
    contactIds: string[],
  ): Promise<{ added: number; existing: number }> {
    const lists = uniqueIds(listIds, "listIds", "list");
    const contacts = uniqueIds(contactIds, "contactIds", "contact");
    if (lists.length === 0 || contacts.length === 0) {
      return { added: 0, existing: 0 };
    }
    const result = await this.repository.addMembers(
      workspaceId,
      lists,
      contacts,
    );
    if (!result.ok) {
      throw result.missing === "list"
        ? validation(
            "One or more lists were not found. They may have been deleted.",
            "listIds",
          )
        : validation(
            "One or more contacts were not found. They may have been deleted.",
            "contactIds",
          );
    }
    return {
      added: result.added,
      existing: lists.length * contacts.length - result.added,
    };
  }

  async removeMembers(
    workspaceId: string,
    listIds: string[],
    contactIds: string[],
  ): Promise<{ removed: number }> {
    const lists = uniqueIds(listIds, "listIds", "list");
    const contacts = uniqueIds(contactIds, "contactIds", "contact");
    if (lists.length === 0 || contacts.length === 0) {
      return { removed: 0 };
    }
    return {
      removed: await this.repository.removeMembers(
        workspaceId,
        lists,
        contacts,
      ),
    };
  }

  async addListMembers(
    workspaceId: string,
    id: string,
    input: { contactIds?: unknown },
  ) {
    const contactIds = parseContactIds(input.contactIds);
    await this.get(workspaceId, id);
    return this.addMembers(workspaceId, [id], contactIds);
  }

  async removeListMembers(
    workspaceId: string,
    id: string,
    input: { contactIds?: unknown },
  ) {
    const contactIds = parseContactIds(input.contactIds);
    await this.get(workspaceId, id);
    return this.removeMembers(workspaceId, [id], contactIds);
  }

  async setMemberStatus(
    workspaceId: string,
    id: string,
    contactId: string,
    input: { status?: unknown },
  ): Promise<void> {
    if (!memberStatuses.includes(input.status as ListMemberStatus)) {
      throw validation("status must be subscribed or unsubscribed.", "status");
    }
    const updated =
      isUuid(id) && isUuid(contactId)
        ? await this.repository.setMemberStatus(
            workspaceId,
            id,
            contactId,
            input.status as ListMemberStatus,
          )
        : false;
    if (!updated) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "not_found",
        "This contact is not a member of this list.",
      );
    }
  }
}
