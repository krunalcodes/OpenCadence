import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { isUuid } from "../../common/uuid";
import { ContactsService } from "../contacts/contacts.service";
import {
  isNameTaken,
  type SegmentChanges,
  type SegmentRow,
  SegmentsRepository,
} from "./segments.repository";

export type SegmentRules = Awaited<
  ReturnType<ContactsService["validateFilter"]>
>;
export type SegmentContactsPage = Awaited<ReturnType<ContactsService["list"]>>;
export type SegmentContact = SegmentContactsPage["contacts"][number];

export type Segment = {
  id: string;
  name: string;
  description: string | null;
  rules: SegmentRules;
  createdAt: string;
  updatedAt: string;
};

export type SegmentActor = {
  workspaceId: string;
  userId: string | null;
};

export type SegmentInput = {
  name?: unknown;
  description?: unknown;
  rules?: unknown;
};

export type SegmentPreview = {
  count: number;
  sample: SegmentContact[];
};

export const maxSegments = 500;
export const previewSampleSize = 5;
const maxNameLength = 80;
const maxDescriptionLength = 500;

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function nameTaken() {
  return apiError(
    HttpStatus.CONFLICT,
    "name_taken",
    "A segment with this name already exists. Choose a different name.",
    "name",
  );
}

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This segment was not found. It may have been deleted.",
  );
}

function parseName(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validation("Give the segment a name.", "name");
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
  if (value === undefined || value === null) {
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

function validationMessage(error: unknown) {
  if (
    !(error instanceof HttpException) ||
    error.getStatus() !== HttpStatus.BAD_REQUEST
  ) {
    return null;
  }
  const response = error.getResponse();
  const message =
    typeof response === "string"
      ? response
      : (response as { message?: unknown }).message;
  return typeof message === "string" ? message.trim() : "";
}

function toSegment(row: SegmentRow): Segment {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rules: row.rules as unknown as SegmentRules,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class SegmentsService {
  constructor(
    @Inject(SegmentsRepository)
    private readonly repository: SegmentsRepository,
    @Inject(ContactsService)
    private readonly contacts: ContactsService,
  ) {}

  async list(workspaceId: string) {
    const rows = await this.repository.list(workspaceId);
    return { segments: rows.map(toSegment) };
  }

  async get(workspaceId: string, id: string): Promise<Segment> {
    return toSegment(await this.find(workspaceId, id));
  }

  async create(actor: SegmentActor, input: SegmentInput): Promise<Segment> {
    const name = parseName(input.name);
    const description = parseDescription(input.description);
    const rules = await this.contacts.validateFilter(
      actor.workspaceId,
      input.rules,
    );
    if ((await this.repository.count(actor.workspaceId)) >= maxSegments) {
      throw apiError(
        HttpStatus.CONFLICT,
        "limit_reached",
        `A workspace can have up to ${maxSegments} segments. Delete one you no longer use and try again.`,
      );
    }
    try {
      return toSegment(
        await this.repository.insert({
          workspaceId: actor.workspaceId,
          name,
          description,
          rules: rules as Record<string, unknown>,
          createdByUserId: actor.userId,
        }),
      );
    } catch (error) {
      throw isNameTaken(error) ? nameTaken() : error;
    }
  }

  async update(
    workspaceId: string,
    id: string,
    input: SegmentInput,
  ): Promise<Segment> {
    const current = await this.find(workspaceId, id);
    const changes: SegmentChanges = {};
    if (input.name !== undefined) {
      changes.name = parseName(input.name);
    }
    if (input.description !== undefined) {
      changes.description = parseDescription(input.description);
    }
    if (input.rules !== undefined) {
      changes.rules = (await this.contacts.validateFilter(
        workspaceId,
        input.rules,
      )) as Record<string, unknown>;
    }
    if (Object.keys(changes).length === 0) {
      return toSegment(current);
    }
    try {
      const updated = await this.repository.update(workspaceId, id, changes);
      if (!updated) {
        throw notFound();
      }
      return toSegment(updated);
    } catch (error) {
      throw isNameTaken(error) ? nameTaken() : error;
    }
  }

  async remove(workspaceId: string, id: string) {
    const removed = isUuid(id)
      ? await this.repository.delete(workspaceId, id)
      : false;
    if (!removed) {
      throw notFound();
    }
  }

  async listContacts(
    workspaceId: string,
    id: string,
    query: { cursor?: string; limit?: number },
  ): Promise<SegmentContactsPage> {
    const filter = await this.currentRules(workspaceId, id);
    return this.contacts.list(workspaceId, {
      filter,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  async countContacts(workspaceId: string, id: string) {
    const filter = await this.currentRules(workspaceId, id);
    return { count: await this.contacts.count(workspaceId, { filter }) };
  }

  async preview(
    workspaceId: string,
    input: { rules?: unknown },
  ): Promise<SegmentPreview> {
    const filter = await this.contacts.validateFilter(workspaceId, input.rules);
    const [count, page] = await Promise.all([
      this.contacts.count(workspaceId, { filter }),
      this.contacts.list(workspaceId, { filter, limit: previewSampleSize }),
    ]);
    return { count, sample: page.contacts.slice(0, previewSampleSize) };
  }

  async currentRules(workspaceId: string, id: string): Promise<SegmentRules> {
    const row = await this.find(workspaceId, id);
    try {
      return await this.contacts.validateFilter(workspaceId, row.rules);
    } catch (error) {
      const reason = validationMessage(error);
      if (reason === null) {
        throw error;
      }
      throw apiError(
        HttpStatus.CONFLICT,
        "segment_invalid",
        reason
          ? `A condition in this segment no longer applies: ${reason} Edit the segment and save it again.`
          : "A condition in this segment no longer applies. Edit the segment and save it again.",
      );
    }
  }

  private async find(workspaceId: string, id: string) {
    const row = isUuid(id) ? await this.repository.find(workspaceId, id) : null;
    if (!row) {
      throw notFound();
    }
    return row;
  }
}
