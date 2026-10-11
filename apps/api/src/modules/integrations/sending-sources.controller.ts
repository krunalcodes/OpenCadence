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
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApiBody,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { AuthSession } from "@workspace/auth";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import type { Env } from "../../config/env";
import {
  type Actor,
  SendingSourcesService,
  type SourcePatch,
} from "./sending-sources.service";

type RedirectReply = {
  code(status: number): RedirectReply;
  header(name: string, value: string): RedirectReply;
  send(): unknown;
};

function actorOf(context: WorkspaceAuthContext): Actor {
  return {
    workspaceId: context.workspaceId,
    userId: context.method === "session" ? context.userId : null,
  };
}

function body(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

@ApiTags("sending sources")
@Controller("sending-sources")
export class SendingSourcesController {
  constructor(
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List sending sources",
    description:
      "Returns the connected mailboxes and provider accounts of the workspace, with today's sent count and 14 days of health. Credentials are never returned.",
  })
  list(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.sources.list(workspace.workspaceId);
  }

  @Get("events")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Activity log",
    description:
      "Events for the workspace's sending sources, newest first. Pass nextCursor back as cursor to read the next page.",
  })
  events(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Query("sourceId") sourceId?: string,
    @Query("severity") severity?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.sources.events(workspace.workspaceId, {
      sourceId: sourceId || undefined,
      severity:
        severity === "warning" || severity === "error" ? severity : undefined,
      cursor: cursor || undefined,
      limit: limit ? Number(limit) || undefined : undefined,
    });
  }

  @Post("resend")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Connect a Resend account",
    description:
      "Checks the API key with Resend, stores it encrypted, and registers bounce and complaint webhooks when the key has full access and WEBHOOK_BASE_URL is set.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name", "apiKey"],
      properties: {
        name: { type: "string", maxLength: 80 },
        apiKey: { type: "string" },
      },
    },
  })
  connectResend(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    const { name, apiKey } = body(input);
    return this.sources.connectResend(actorOf(workspace), { name, apiKey });
  }

  @Post("gmail/authorize")
  @HttpCode(200)
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Start connecting a Gmail mailbox",
    description:
      "Returns the Google consent URL to send the browser to. Google returns the user to the callback, which finishes the connection.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: { dailySendLimit: { type: "integer", minimum: 1 } },
    },
  })
  gmailAuthorize(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.sources.gmailAuthorizeUrl(actorOf(workspace), {
      dailySendLimit: body(input).dailySendLimit,
    });
  }

  @Get("gmail/callback")
  @AllowAnonymous()
  @ApiExcludeEndpoint()
  async gmailCallback(
    @Req() request: { session?: AuthSession | null },
    @Res() reply: RedirectReply,
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
  ) {
    const outcome = await this.sources.gmailCallback(
      request.session?.user.id ?? null,
      { code, state, error },
    );
    const base = this.config
      .get("BETTER_AUTH_URL", { infer: true })
      .replace(/\/+$/, "");
    const query = outcome.connected
      ? "connected=gmail"
      : `connect_error=${encodeURIComponent(outcome.code)}`;
    return reply
      .code(302)
      .header("location", `${base}/app/integrations?${query}`)
      .send();
  }

  @Patch(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Rename, set the daily limit, or pause a source" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 80 },
        dailySendLimit: { type: "integer", minimum: 1, nullable: true },
        paused: { type: "boolean" },
        isDefault: { type: "boolean" },
      },
    },
  })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const { name, dailySendLimit, paused, isDefault } = body(input);
    return this.sources.update(actorOf(workspace), id, {
      name,
      dailySendLimit,
      paused,
      isDefault,
    } as SourcePatch);
  }

  @Post(":id/test")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Test the connection of a source" })
  test(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.sources.test(actorOf(workspace), id);
  }

  @Post(":id/test-email")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Send a test email through a source",
    description:
      "The From address is the mailbox itself for Gmail. For Resend, pass a From address on a verified domain.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["to"],
      properties: {
        to: { type: "string", format: "email" },
        from: { type: "string", format: "email" },
      },
    },
  })
  testEmail(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const { to, from } = body(input);
    return this.sources.sendTestEmail(actorOf(workspace), id, { to, from });
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Disconnect a source",
    description:
      "Deletes the stored credentials and removes the source from the workspace. Its activity log is kept.",
  })
  async disconnect(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.sources.disconnect(actorOf(workspace), id);
  }
}
