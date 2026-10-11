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
import { FormsService } from "./forms.service";

@ApiTags("forms")
@Controller("forms")
export class FormsController {
  constructor(@Inject(FormsService) private readonly forms: FormsService) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List the forms",
    description:
      "Every subscription form in the workspace, newest first, with how many submissions it received and how many were confirmed.",
  })
  list(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.forms.list(workspace.workspaceId);
  }

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Create a form",
    description:
      "Creates a draft with an email field and double opt-in on. Names are unique in a workspace, ignoring case.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string", minLength: 1, maxLength: 120 } },
    },
  })
  create(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.forms.create(workspace, input);
  }

  @Get(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Get a form",
    description:
      "The form with its fields, texts, sending source and the snippets for sharing it.",
  })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.forms.get(workspace.workspaceId, id);
  }

  @Patch(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Update a form",
    description:
      "Send only what changes. A published form refuses a change that would stop it working, with the code form_not_ready and the reasons.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        listIds: {
          type: "array",
          maxItems: 20,
          items: { type: "string", format: "uuid" },
        },
        doubleOptIn: { type: "boolean" },
        fields: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            required: ["key"],
            properties: {
              key: { type: "string" },
              label: { type: "string", maxLength: 80 },
              required: { type: "boolean" },
            },
          },
        },
        settings: {
          type: "object",
          properties: {
            title: { type: "string", maxLength: 120 },
            description: { type: "string", maxLength: 500 },
            buttonLabel: { type: "string", maxLength: 40 },
            consentText: { type: "string", maxLength: 500 },
            successTitle: { type: "string", maxLength: 120 },
            successMessage: { type: "string", maxLength: 500 },
            redirectUrl: { type: "string", maxLength: 2000, nullable: true },
            confirmSubject: { type: "string", maxLength: 150 },
            fromEmail: { type: "string", format: "email", nullable: true },
          },
        },
        sourceId: { type: "string", format: "uuid", nullable: true },
      },
    },
  })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.forms.update(workspace.workspaceId, id, input);
  }

  @Post(":id/publish")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Publish a form",
    description:
      "Makes the form reachable. Returns 409 with the code form_not_ready and a problems list when it has no list, or when double opt-in is on and no sending source can send the confirmation email.",
  })
  publish(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.forms.publish(workspace.workspaceId, id);
  }

  @Post(":id/unpublish")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Unpublish a form",
    description: "Takes the form back to a draft. Its link stops working.",
  })
  unpublish(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.forms.unpublish(workspace.workspaceId, id);
  }

  @Post(":id/archive")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Archive a form",
    description:
      "Stops the form and keeps its submissions. Confirmation links that were already sent keep working.",
  })
  archive(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.forms.archive(workspace.workspaceId, id);
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Delete a form",
    description:
      "Deletes the form and its submissions. Contacts that subscribed through it are kept.",
  })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.forms.remove(workspace.workspaceId, id);
  }

  @Get(":id/submissions")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List a form's submissions",
    description: "Newest first, 50 a page by default and up to 100.",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["pending", "confirmed", "subscribed", "rejected"],
  })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "limit", required: false })
  submissions(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Query("status") status?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.forms.listSubmissions(workspace.workspaceId, id, {
      status,
      cursor,
      limit,
    });
  }
}
