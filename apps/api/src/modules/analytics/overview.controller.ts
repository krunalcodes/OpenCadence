import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { overviewRanges } from "./overview";
import { OverviewService } from "./overview.service";

@ApiTags("analytics")
@Controller("overview")
export class OverviewController {
  constructor(
    @Inject(OverviewService) private readonly overview: OverviewService,
  ) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Read the workspace overview",
    description:
      "Everything the Overview screen shows in one response: totals and rates for the range and the equal range before it, what goes out today hour by hour in the given time zone, recent campaigns and active sequences, sending sources with their health, and the most important problem right now, if any. The response is cached for 60 seconds per workspace, range and time zone.",
  })
  @ApiQuery({
    name: "range",
    required: false,
    enum: overviewRanges,
    description: "Defaults to 7d.",
  })
  @ApiQuery({
    name: "timezone",
    required: false,
    type: String,
    description:
      "IANA time zone name used for today and its hours, for example Europe/Berlin. Defaults to UTC.",
  })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Query("range") range?: string,
    @Query("timezone") timezone?: string,
  ) {
    return this.overview.get(workspace.workspaceId, { range, timezone });
  }
}
