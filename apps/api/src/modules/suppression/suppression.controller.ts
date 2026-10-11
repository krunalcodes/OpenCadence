import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import {
  type SuppressionActor,
  SuppressionService,
} from "./suppression.service";

function actorOf(context: WorkspaceAuthContext): SuppressionActor {
  return context.method === "session"
    ? {
        workspaceId: context.workspaceId,
        userId: context.userId,
        origin: "user",
      }
    : { workspaceId: context.workspaceId, userId: null, origin: "api" };
}

function body(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

@ApiTags("suppressions")
@Controller("suppressions")
export class SuppressionController {
  constructor(
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
  ) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List suppressed addresses",
    description:
      "Addresses the workspace does not send to, newest first. Pass nextCursor back as cursor to read the next page.",
  })
  @ApiQuery({
    name: "reason",
    required: false,
    enum: ["unsubscribed", "bounced", "complained", "manual"],
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Matches addresses that start with this text, ignoring case.",
  })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  })
  list(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Query("reason") reason?: string,
    @Query("search") search?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.suppression.list(workspace.workspaceId, {
      reason: reason || undefined,
      search: search || undefined,
      cursor: cursor || undefined,
      limit: limit ? Number(limit) || undefined : undefined,
    });
  }

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Suppress addresses",
    description:
      "Adds up to 1000 addresses. Addresses that are already suppressed for the same reason are counted as existing. Bounces and complaints are recorded automatically and cannot be added here.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["emails"],
      properties: {
        emails: {
          type: "array",
          minItems: 1,
          maxItems: 1000,
          items: { type: "string", format: "email" },
        },
        reason: {
          type: "string",
          enum: ["manual", "unsubscribed"],
          default: "manual",
        },
        note: { type: "string", maxLength: 500 },
      },
    },
  })
  add(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    const { emails, reason, note } = body(input);
    return this.suppression.add(actorOf(workspace), { emails, reason, note });
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Remove a suppression",
    description:
      "The address can receive email again unless it is suppressed for another reason.",
  })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.suppression.remove(workspace.workspaceId, id);
  }
}
