import { Body, Controller, Get, Inject, Param, Put } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { WarmupService } from "./warmup.service";

function body(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

@ApiTags("warmup")
@Controller("warmup")
export class WarmupController {
  constructor(@Inject(WarmupService) private readonly warmup: WarmupService) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List inbox warm-up for every sending source",
    description:
      "Returns one entry per connected sending source with its warm-up state, today's progress and inbox placement over the last 14 days, plus the size of the shared warm-up pool.",
  })
  list(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.warmup.list(workspace.workspaceId);
  }

  @Put(":sourceId")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Turn warm-up on or off and change its settings",
    description:
      "Only sources that can read their inbox can be warmed up. Turning warm-up on adds the mailbox to the pool shared by every workspace on this server.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        paused: { type: "boolean" },
        startPerDay: { type: "integer", minimum: 1, maximum: 50, default: 5 },
        incrementPerDay: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          default: 2,
        },
        maxPerDay: { type: "integer", minimum: 1, maximum: 50, default: 30 },
        randomize: { type: "boolean", default: true },
        replyRate: { type: "integer", minimum: 0, maximum: 60, default: 30 },
        weekdaysOnly: { type: "boolean", default: false },
      },
    },
  })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("sourceId") sourceId: string,
    @Body() input: unknown,
  ) {
    return this.warmup.update(workspace.workspaceId, sourceId, body(input));
  }
}
