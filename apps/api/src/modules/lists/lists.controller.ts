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
} from "@nestjs/common";
import {
  ApiBody,
  type ApiBodyOptions,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { ListsService } from "./lists.service";

function body(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

const contactIdsBody: ApiBodyOptions = {
  schema: {
    type: "object",
    required: ["contactIds"],
    properties: {
      contactIds: {
        type: "array",
        minItems: 1,
        maxItems: 1000,
        items: { type: "string", format: "uuid" },
      },
    },
  },
};

@ApiTags("lists")
@Controller("lists")
export class ListsController {
  constructor(@Inject(ListsService) private readonly lists: ListsService) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List the lists",
    description:
      "Every list in the workspace, ordered by name, with how many contacts are subscribed and unsubscribed.",
  })
  list(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.lists.list(workspace.workspaceId);
  }

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Create a list",
    description:
      "Names are unique in a workspace, ignoring case. A taken name returns 409 with the code name_taken.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80 },
        description: { type: "string", maxLength: 500, nullable: true },
        isPublic: {
          type: "boolean",
          description:
            "Show this list in the preference centre, where recipients choose what they get.",
        },
        publicName: { type: "string", maxLength: 80, nullable: true },
        publicDescription: { type: "string", maxLength: 500, nullable: true },
      },
    },
  })
  create(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    const { name, description, isPublic, publicName, publicDescription } =
      body(input);
    return this.lists.create(workspace.workspaceId, {
      name,
      description,
      isPublic,
      publicName,
      publicDescription,
    });
  }

  @Get(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Get a list" })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.lists.get(workspace.workspaceId, id);
  }

  @Patch(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Update a list",
    description: "Send only the fields to change.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80 },
        description: { type: "string", maxLength: 500, nullable: true },
        isPublic: {
          type: "boolean",
          description:
            "Show this list in the preference centre, where recipients choose what they get.",
        },
        publicName: { type: "string", maxLength: 80, nullable: true },
        publicDescription: { type: "string", maxLength: 500, nullable: true },
      },
    },
  })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const { name, description, isPublic, publicName, publicDescription } =
      body(input);
    return this.lists.update(workspace.workspaceId, id, {
      name,
      description,
      isPublic,
      publicName,
      publicDescription,
    });
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Delete a list",
    description:
      "Contacts are kept. Their memberships of this list are removed.",
  })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.lists.remove(workspace.workspaceId, id);
  }

  @Post(":id/members")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Add contacts to a list",
    description:
      "Adds up to 1000 contacts as subscribed. Contacts already on the list are counted as existing, and a contact that unsubscribed stays unsubscribed.",
  })
  @ApiBody(contactIdsBody)
  addMembers(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const { contactIds } = body(input);
    return this.lists.addListMembers(workspace.workspaceId, id, {
      contactIds,
    });
  }

  @Post(":id/members/remove")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Remove contacts from a list",
    description: "Removes up to 1000 contacts. The contacts are kept.",
  })
  @ApiBody(contactIdsBody)
  removeMembers(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const { contactIds } = body(input);
    return this.lists.removeListMembers(workspace.workspaceId, id, {
      contactIds,
    });
  }

  @Patch(":id/members/:contactId")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Subscribe or unsubscribe a member",
    description:
      "Changes the status of a contact that is already on the list. Returns 404 when the contact is not a member.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["status"],
      properties: {
        status: { type: "string", enum: ["subscribed", "unsubscribed"] },
      },
    },
  })
  async setMemberStatus(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @Body() input: unknown,
  ) {
    const { status } = body(input);
    await this.lists.setMemberStatus(workspace.workspaceId, id, contactId, {
      status,
    });
  }
}
