import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { WorkspacesService } from "./workspaces.service";

@ApiTags("workspaces")
@Controller("workspace")
export class WorkspacesController {
  constructor(
    @Inject(WorkspacesService)
    private readonly workspaces: WorkspacesService,
  ) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Current workspace",
    description:
      "Returns the active workspace of the signed-in session, or the workspace that owns the API key sent in the x-api-key header.",
  })
  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["id", "name", "slug"],
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        slug: { type: "string" },
      },
    },
  })
  getWorkspace(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.workspaces.getById(workspace.workspaceId);
  }
}
