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
import { TagsService } from "./tags.service";

function body(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

const nameBody: ApiBodyOptions = {
  schema: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 50 },
    },
  },
};

@ApiTags("tags")
@Controller("tags")
export class TagsController {
  constructor(@Inject(TagsService) private readonly tags: TagsService) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List tags",
    description:
      "Every tag in the workspace, ordered by name, with how many contacts carry it.",
  })
  list(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.tags.list(workspace.workspaceId);
  }

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Create a tag",
    description:
      "Names are unique in a workspace, ignoring case. A taken name returns 409 with the code name_taken.",
  })
  @ApiBody(nameBody)
  create(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    const { name } = body(input);
    return this.tags.create(workspace.workspaceId, { name });
  }

  @Patch(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Rename a tag" })
  @ApiBody(nameBody)
  rename(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const { name } = body(input);
    return this.tags.rename(workspace.workspaceId, id, { name });
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Delete a tag",
    description: "Contacts are kept. The tag is removed from each of them.",
  })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.tags.remove(workspace.workspaceId, id);
  }
}
