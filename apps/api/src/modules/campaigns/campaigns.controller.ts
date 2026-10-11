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
import { campaignStatuses } from "./campaigns.constants";
import { CampaignsService } from "./campaigns.service";

const draftProperties = {
  name: { type: "string", minLength: 1, maxLength: 120 },
  templateId: { type: "string", format: "uuid", nullable: true },
  subject: { type: "string", maxLength: 998 },
  previewText: { type: "string", maxLength: 300 },
  fromName: { type: "string", maxLength: 120, nullable: true },
  fromEmail: {
    type: "string",
    format: "email",
    nullable: true,
    description: "Needed only when the sending source has no fixed address.",
  },
  replyTo: { type: "string", format: "email", nullable: true },
  sourceId: {
    type: "string",
    format: "uuid",
    nullable: true,
    description: "Defaults to the workspace's default sending source.",
  },
  audience: {
    type: "object",
    nullable: true,
    description:
      "Who receives the campaign. Send listIds with type lists, and segmentId with type segment.",
    properties: {
      type: { type: "string", enum: ["all", "lists", "segment"] },
      listIds: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: { type: "string", format: "uuid" },
      },
      segmentId: { type: "string", format: "uuid" },
    },
  },
  trackOpens: { type: "boolean" },
  trackClicks: { type: "boolean" },
};

function limitOf(value: string | undefined) {
  return value ? Number(value) || undefined : undefined;
}

@ApiTags("campaigns")
@Controller("campaigns")
export class CampaignsController {
  constructor(
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
  ) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List campaigns",
    description:
      "Campaigns in the workspace, newest first, with their results so far. search matches the name. Pass nextCursor back as cursor to read the next page.",
  })
  @ApiQuery({ name: "status", required: false, enum: campaignStatuses })
  list(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.campaigns.list(workspace.workspaceId, {
      status: status || undefined,
      search: search || undefined,
      cursor: cursor || undefined,
      limit: limitOf(limit),
    });
  }

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Create a campaign",
    description:
      "Creates a draft. Only the name is needed; every other field can be set now or later. Choosing a template copies its subject and preview text when the campaign has none.",
  })
  @ApiBody({
    schema: { type: "object", required: ["name"], properties: draftProperties },
  })
  create(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.campaigns.create(workspace, input);
  }

  @Get(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Get a campaign" })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.campaigns.get(workspace.workspaceId, id);
  }

  @Patch(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Update a draft campaign",
    description:
      "Send only the fields to change. A campaign that is scheduled, sending or finished returns 409 with the code not_editable.",
  })
  @ApiBody({ schema: { type: "object", properties: draftProperties } })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.campaigns.update(workspace.workspaceId, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Delete a campaign",
    description:
      "A campaign that is sending returns 409 with the code campaign_sending. Pause or cancel it first.",
  })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.campaigns.remove(workspace.workspaceId, id);
  }

  @Post(":id/duplicate")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Duplicate a campaign",
    description:
      'Creates a new draft with the same content, audience and sender, named after the original with "copy" added. Results are not copied.',
  })
  duplicate(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.campaigns.duplicate(workspace, id);
  }

  @Get(":id/check")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Check whether a campaign is ready to send",
    description:
      "Lists what blocks sending (errors) and what is worth a look (warnings), with the number of recipients right now. Pass scheduledAt to check a planned send time too.",
  })
  @ApiQuery({ name: "scheduledAt", required: false, type: String })
  check(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Query("scheduledAt") scheduledAt?: string,
  ) {
    return this.campaigns.check(workspace.workspaceId, id, scheduledAt);
  }

  @Post(":id/send")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Send or schedule a campaign",
    description:
      "Runs the same checks as the check route and returns 409 with the code not_ready and the problems when any is an error. The content is saved as it is at this moment: later changes to the template do not affect this campaign. Without scheduledAt the campaign starts sending now.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: { scheduledAt: { type: "string", format: "date-time" } },
    },
  })
  send(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.campaigns.send(workspace.workspaceId, id, input);
  }

  @Post(":id/unschedule")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Unschedule a campaign",
    description: "Turns a scheduled campaign back into a draft.",
  })
  unschedule(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.campaigns.unschedule(workspace.workspaceId, id);
  }

  @Post(":id/pause")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Pause a campaign",
    description:
      "Stops handing more recipients to the send queue. Emails already in the queue, up to about two thousand, still send.",
  })
  pause(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.campaigns.pause(workspace.workspaceId, id);
  }

  @Post(":id/resume")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Resume a paused campaign",
    description:
      "Continues from where the campaign stopped. Nobody receives it twice.",
  })
  resume(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.campaigns.resume(workspace.workspaceId, id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Cancel a campaign",
    description:
      "Stops a scheduled, sending or paused campaign for good. Emails already handed to the send queue still send; the remaining recipients receive nothing.",
  })
  cancel(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.campaigns.cancel(workspace.workspaceId, id);
  }

  @Get(":id/recipients")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List the recipients of a campaign",
    description:
      "One entry per email handed to the send queue, newest first, with its delivery status and whether it was opened or clicked. Pass nextCursor back as cursor to read the next page.",
  })
  @ApiQuery({ name: "status", required: false, type: String })
  recipients(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Query("status") status?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.campaigns.recipients(workspace.workspaceId, id, {
      status: status || undefined,
      cursor: cursor || undefined,
      limit: limitOf(limit),
    });
  }

  @Post(":id/test")
  @HttpCode(202)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Send a test of a campaign",
    description:
      "Fills merge tags with sample values and the workspace's brand, puts [Test] before the subject, and queues one email through the campaign's sending source. The suppression list still applies.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["to"],
      properties: { to: { type: "string", format: "email" } },
    },
  })
  sendTest(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.campaigns.sendTest(workspace.workspaceId, id, input);
  }
}
