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
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { TemplatesService } from "./templates.service";

const templateProperties = {
  name: { type: "string", minLength: 1, maxLength: 120 },
  subject: { type: "string", maxLength: 998 },
  previewText: { type: "string", maxLength: 300 },
  document: {
    type: "object",
    nullable: true,
    description: "The editor document the HTML was exported from.",
  },
  html: { type: "string", maxLength: 1000000 },
  text: { type: "string", maxLength: 500000 },
};

@ApiTags("templates")
@Controller("templates")
export class TemplatesController {
  constructor(
    @Inject(TemplatesService) private readonly templates: TemplatesService,
  ) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List templates",
    description:
      "Templates in the workspace, most recently changed first, without their content. search matches the name or the subject. Pass nextCursor back as cursor to read the next page.",
  })
  list(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Query("search") search?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.templates.list(workspace.workspaceId, {
      search: search || undefined,
      cursor: cursor || undefined,
      limit: limit ? Number(limit) || undefined : undefined,
    });
  }

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Create a template",
    description:
      "Names are unique in a workspace, ignoring case. A taken name returns 409 with the code name_taken.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name"],
      properties: templateProperties,
    },
  })
  create(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.templates.create(workspace, input);
  }

  @Post("test")
  @HttpCode(202)
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Send a test of a template",
    description:
      "Fills merge tags with sample values and the workspace's brand, puts [Test] before the subject, and queues one email. The suppression list still applies.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["to", "html"],
      properties: {
        to: { type: "string", format: "email" },
        subject: { type: "string", maxLength: 998 },
        html: { type: "string", maxLength: 1000000 },
        text: { type: "string", maxLength: 500000 },
        sourceId: {
          type: "string",
          format: "uuid",
          description: "Defaults to the workspace's default sending source.",
        },
        from: {
          type: "string",
          format: "email",
          description:
            "Needed only when the sending source has no fixed address.",
        },
      },
    },
  })
  sendTest(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.templates.sendTest(workspace.workspaceId, input);
  }

  @Get(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Get a template" })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.templates.get(workspace.workspaceId, id);
  }

  @Patch(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Update a template",
    description: "Send only the fields to change.",
  })
  @ApiBody({ schema: { type: "object", properties: templateProperties } })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.templates.update(workspace, id, input);
  }

  @Post(":id/duplicate")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Duplicate a template",
    description:
      'Creates a copy named after the original with "copy" added, then "copy 2" and so on.',
  })
  duplicate(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.templates.duplicate(workspace, id);
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Delete a template" })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.templates.remove(workspace.workspaceId, id);
  }
}
