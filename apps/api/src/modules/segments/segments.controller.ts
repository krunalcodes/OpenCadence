import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { type SegmentActor, SegmentsService } from "./segments.service";

function actorOf(context: WorkspaceAuthContext): SegmentActor {
  return context.method === "session"
    ? { workspaceId: context.workspaceId, userId: context.userId }
    : { workspaceId: context.workspaceId, userId: null };
}

function body(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

const rulesSchema = {
  type: "object",
  required: ["match", "conditions"],
  description:
    "A filter group. Groups nest one level deep and hold up to 30 conditions in total.",
  properties: {
    match: { type: "string", enum: ["all", "any"] },
    conditions: { type: "array", items: { type: "object" } },
  },
};

@ApiTags("segments")
@Controller("segments")
export class SegmentsController {
  constructor(
    @Inject(SegmentsService)
    private readonly segments: SegmentsService,
  ) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List segments",
    description: "Every segment in the workspace, ordered by name.",
  })
  list(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.segments.list(workspace.workspaceId);
  }

  @Post("preview")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Preview segment rules",
    description:
      "Counts the contacts that match the rules and returns up to 5 of them. Nothing is saved.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["rules"],
      properties: { rules: rulesSchema },
    },
  })
  preview(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    const { rules } = body(input);
    return this.segments.preview(workspace.workspaceId, { rules });
  }

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Create a segment",
    description:
      "Saves a set of rules under a name. A segment stores rules, not contacts, so its members are worked out each time it is read. A workspace can have up to 500 segments.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name", "rules"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80 },
        description: { type: "string", maxLength: 500, nullable: true },
        rules: rulesSchema,
      },
    },
  })
  create(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    const { name, description, rules } = body(input);
    return this.segments.create(actorOf(workspace), {
      name,
      description,
      rules,
    });
  }

  @Get(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Get a segment" })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.segments.get(workspace.workspaceId, id);
  }

  @Patch(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Update a segment",
    description:
      "Changes the name, description or rules. Fields that are left out stay as they are.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80 },
        description: { type: "string", maxLength: 500, nullable: true },
        rules: rulesSchema,
      },
    },
  })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const { name, description, rules } = body(input);
    return this.segments.update(workspace.workspaceId, id, {
      name,
      description,
      rules,
    });
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Delete a segment",
    description: "Deletes the saved rules. No contacts are deleted.",
  })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.segments.remove(workspace.workspaceId, id);
  }

  @Get(":id/contacts")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List the contacts in a segment",
    description:
      "Contacts that match the segment's rules right now, newest first. Pass nextCursor back as cursor to read the next page. Returns segment_invalid when a list, tag or custom field used by a rule has been deleted.",
  })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  })
  contacts(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.segments.listContacts(workspace.workspaceId, id, {
      cursor: cursor || undefined,
      limit: limit ? Number(limit) || undefined : undefined,
    });
  }

  @Get(":id/count")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Count the contacts in a segment",
    description:
      "How many contacts match the segment's rules right now. Returns segment_invalid when a list, tag or custom field used by a rule has been deleted.",
  })
  count(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.segments.countContacts(workspace.workspaceId, id);
  }
}
