import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { isUuid } from "../../common/uuid";
import { ContactsService } from "../contacts/contacts.service";
import { compileFilter } from "../contacts/filters/filter.compiler";
import {
  type AudienceContactRow,
  AudienceRepository,
  type AudienceScope,
} from "./audience.repository";
import { SegmentsService } from "./segments.service";

export type Audience =
  | { type: "all" }
  | { type: "lists"; listIds: string[] }
  | { type: "segment"; segmentId: string };

export type AudienceContact = AudienceContactRow;

export type AudienceDescription = { label: string; listIds: string[] };

export const maxAudienceLists = 50;
export const maxAudiencePageSize = 1000;
const namedListsInLabel = 3;

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function listsNotFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "One or more lists were not found. They may have been deleted.",
    "audience.listIds",
  );
}

function segmentNotFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This segment was not found. It may have been deleted.",
    "audience.segmentId",
  );
}

export function parseAudience(input: unknown): Audience {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw validation(
      "Choose who receives this: all contacts, lists or a segment.",
      "audience",
    );
  }
  const value = input as Record<string, unknown>;
  if (value.type === "all") {
    return { type: "all" };
  }
  if (value.type === "lists") {
    const { listIds } = value;
    if (!Array.isArray(listIds) || listIds.length === 0) {
      throw validation("Choose at least one list.", "audience.listIds");
    }
    const unique = new Set<string>();
    for (const id of listIds) {
      if (typeof id !== "string" || !isUuid(id)) {
        throw validation("Every entry must be a list id.", "audience.listIds");
      }
      unique.add(id.toLowerCase());
    }
    if (unique.size > maxAudienceLists) {
      throw validation(
        `Choose up to ${maxAudienceLists} lists.`,
        "audience.listIds",
      );
    }
    return { type: "lists", listIds: [...unique] };
  }
  if (value.type === "segment") {
    const { segmentId } = value;
    if (typeof segmentId !== "string" || !isUuid(segmentId)) {
      throw validation("Choose a segment.", "audience.segmentId");
    }
    return { type: "segment", segmentId: segmentId.toLowerCase() };
  }
  throw validation("type must be all, lists or segment.", "audience.type");
}

export function listsLabel(names: string[]) {
  if (names.length === 0) {
    return "No lists";
  }
  if (names.length <= namedListsInLabel) {
    return names.join(", ");
  }
  const rest = names.length - namedListsInLabel;
  return `${names.slice(0, namedListsInLabel).join(", ")} and ${rest} more`;
}

@Injectable()
export class AudienceService {
  constructor(
    @Inject(AudienceRepository)
    private readonly repository: AudienceRepository,
    @Inject(SegmentsService)
    private readonly segments: SegmentsService,
    @Inject(ContactsService)
    private readonly contacts: ContactsService,
  ) {}

  async validate(workspaceId: string, input: unknown): Promise<Audience> {
    const audience = parseAudience(input);
    if (audience.type === "lists") {
      const found = await this.repository.findLists(
        workspaceId,
        audience.listIds,
      );
      if (found.length !== audience.listIds.length) {
        throw listsNotFound();
      }
    }
    if (audience.type === "segment") {
      await this.segment(workspaceId, audience.segmentId);
    }
    return audience;
  }

  async count(workspaceId: string, audience: Audience): Promise<number> {
    return this.repository.count(
      workspaceId,
      await this.scope(workspaceId, audience),
    );
  }

  async page(
    workspaceId: string,
    audience: Audience,
    afterContactId: string | null,
    limit: number,
  ): Promise<AudienceContact[]> {
    if (afterContactId !== null && !isUuid(afterContactId)) {
      throw validation(
        "afterContactId must be a contact id.",
        "afterContactId",
      );
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > maxAudiencePageSize) {
      throw validation(
        `limit must be a whole number from 1 to ${maxAudiencePageSize}.`,
        "limit",
      );
    }
    return this.repository.page(
      workspaceId,
      await this.scope(workspaceId, audience),
      afterContactId,
      limit,
    );
  }

  async describe(
    workspaceId: string,
    audience: Audience,
  ): Promise<AudienceDescription> {
    if (audience.type === "all") {
      return { label: "All contacts", listIds: [] };
    }
    if (audience.type === "segment") {
      const segment = await this.segment(workspaceId, audience.segmentId);
      return { label: segment.name, listIds: [] };
    }
    const found =
      audience.listIds.length > 0
        ? await this.repository.findLists(workspaceId, audience.listIds)
        : [];
    return {
      label: listsLabel(found.map((list) => list.name)),
      listIds: found.map((list) => list.id),
    };
  }

  private async segment(workspaceId: string, segmentId: string) {
    try {
      return await this.segments.get(workspaceId, segmentId);
    } catch (error) {
      const status = (error as { getStatus?: () => number }).getStatus?.();
      throw status === HttpStatus.NOT_FOUND ? segmentNotFound() : error;
    }
  }

  private async scope(
    workspaceId: string,
    audience: Audience,
  ): Promise<AudienceScope> {
    if (audience.type === "all") {
      return { type: "all" };
    }
    if (audience.type === "lists") {
      if (audience.listIds.length === 0) {
        throw validation("Choose at least one list.", "audience.listIds");
      }
      return { type: "lists", listIds: audience.listIds };
    }
    const [rules, fields] = await Promise.all([
      this.segments.currentRules(workspaceId, audience.segmentId),
      this.contacts.listFields(workspaceId),
    ]);
    return {
      type: "segment",
      filter: compileFilter(
        rules,
        new Map(fields.map((field) => [field.key, field])),
      ),
    };
  }
}
