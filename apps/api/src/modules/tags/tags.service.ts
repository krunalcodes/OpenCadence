import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { isUuid } from "../../common/uuid";
import { type TagRow, TagsRepository } from "./tags.repository";

export type Tag = {
  id: string;
  name: string;
  contactCount: number;
  createdAt: string;
};

const maxNameLength = 50;

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This tag was not found. It may have been deleted.",
  );
}

function nameTaken() {
  return apiError(
    HttpStatus.CONFLICT,
    "name_taken",
    "A tag with this name already exists. Choose another name.",
    "name",
  );
}

function parseName(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validation("Give the tag a name.", "name");
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

function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    contactCount: row.contactCount,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class TagsService {
  constructor(
    @Inject(TagsRepository) private readonly repository: TagsRepository,
  ) {}

  async list(workspaceId: string): Promise<{ tags: Tag[] }> {
    const rows = await this.repository.listWithCounts(workspaceId);
    return { tags: rows.map(toTag) };
  }

  private async get(workspaceId: string, id: string): Promise<Tag> {
    const row = await this.repository.findWithCounts(workspaceId, id);
    if (!row) {
      throw notFound();
    }
    return toTag(row);
  }

  async create(workspaceId: string, input: { name?: unknown }): Promise<Tag> {
    const result = await this.repository.insert(
      workspaceId,
      parseName(input.name),
    );
    if (!result.ok) {
      throw result.reason === "name_taken" ? nameTaken() : notFound();
    }
    return this.get(workspaceId, result.id);
  }

  async rename(
    workspaceId: string,
    id: string,
    input: { name?: unknown },
  ): Promise<Tag> {
    const name = parseName(input.name);
    if (!isUuid(id)) {
      throw notFound();
    }
    const result = await this.repository.rename(workspaceId, id, name);
    if (!result.ok) {
      throw result.reason === "name_taken" ? nameTaken() : notFound();
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

  async assertExist(workspaceId: string, tagIds: string[]): Promise<void> {
    const ids = uniqueIds(tagIds, "tagIds", "tag");
    if (ids.length === 0) {
      return;
    }
    const found = await this.repository.findExistingIds(workspaceId, ids);
    if (found.length !== ids.length) {
      throw validation(
        "One or more tags were not found. They may have been deleted.",
        "tagIds",
      );
    }
  }

  async attach(
    workspaceId: string,
    tagIds: string[],
    contactIds: string[],
  ): Promise<{ added: number }> {
    const tags = uniqueIds(tagIds, "tagIds", "tag");
    const contacts = uniqueIds(contactIds, "contactIds", "contact");
    if (tags.length === 0 || contacts.length === 0) {
      return { added: 0 };
    }
    const result = await this.repository.attach(workspaceId, tags, contacts);
    if (!result.ok) {
      throw result.missing === "tag"
        ? validation(
            "One or more tags were not found. They may have been deleted.",
            "tagIds",
          )
        : validation(
            "One or more contacts were not found. They may have been deleted.",
            "contactIds",
          );
    }
    return { added: result.added };
  }

  async detach(
    workspaceId: string,
    tagIds: string[],
    contactIds: string[],
  ): Promise<{ removed: number }> {
    const tags = uniqueIds(tagIds, "tagIds", "tag");
    const contacts = uniqueIds(contactIds, "contactIds", "contact");
    if (tags.length === 0 || contacts.length === 0) {
      return { removed: 0 };
    }
    return {
      removed: await this.repository.detach(workspaceId, tags, contacts),
    };
  }
}
