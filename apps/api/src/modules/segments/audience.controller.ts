import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { AudienceService } from "./audience.service";

const audienceSchema = {
  type: "object",
  required: ["type"],
  description:
    "Who receives the email. Send listIds with type lists, and segmentId with type segment.",
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
};

@ApiTags("audiences")
@Controller("audiences")
export class AudienceController {
  constructor(
    @Inject(AudienceService)
    private readonly audiences: AudienceService,
  ) {}

  @Post("count")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Count the recipients of an audience",
    description:
      "How many contacts would receive a campaign sent to this audience right now: every contact, the subscribed members of one or more lists (each contact once), or the contacts matching a segment. Contacts with a suppressed address are never counted.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["audience"],
      properties: { audience: audienceSchema },
    },
  })
  async count(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    const audience = await this.audiences.validate(
      workspace.workspaceId,
      typeof input === "object" && input !== null
        ? (input as Record<string, unknown>).audience
        : undefined,
    );
    return {
      count: await this.audiences.count(workspace.workspaceId, audience),
    };
  }
}
