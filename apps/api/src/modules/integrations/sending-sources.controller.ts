import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
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
import { apiError } from "./api-error";
import { isMailboxProvider } from "./mailbox-providers";
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

  @Post("imap-smtp")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Connect a mailbox over IMAP and SMTP",
    description:
      "Signs in to both servers to check the details, then stores them encrypted. Most providers need an app password.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: [
        "email",
        "password",
        "smtpHost",
        "smtpPort",
        "smtpSecurity",
        "imapHost",
        "imapPort",
        "imapSecurity",
      ],
      properties: {
        email: { type: "string", format: "email" },
        username: { type: "string" },
        password: { type: "string" },
        name: { type: "string", maxLength: 80 },
        smtpHost: { type: "string" },
        smtpPort: { type: "integer" },
        smtpSecurity: { type: "string", enum: ["tls", "starttls"] },
        imapHost: { type: "string" },
        imapPort: { type: "integer" },
        imapSecurity: { type: "string", enum: ["tls", "starttls"] },
        dailySendLimit: { type: "integer", minimum: 1 },
      },
    },
  })
  connectImapSmtp(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.sources.connectImapSmtp(actorOf(workspace), body(input));
  }

  @Post("ses")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Connect an Amazon SES account",
    description:
      "Checks the access key with Amazon SES in the chosen region, stores it encrypted, and returns whether the account is in the sandbox, its sending quota, and its verified identities.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name", "accessKeyId", "secretAccessKey", "region"],
      properties: {
        name: { type: "string", maxLength: 80 },
        accessKeyId: { type: "string" },
        secretAccessKey: { type: "string" },
        region: { type: "string", example: "us-east-1" },
        configurationSet: { type: "string", maxLength: 64 },
        topicArn: { type: "string" },
        dailySendLimit: { type: "integer", minimum: 1 },
      },
    },
  })
  connectSes(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.sources.connectSes(actorOf(workspace), body(input));
  }

  @Post(":provider/authorize")
  @HttpCode(200)
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Start connecting a Gmail or Outlook mailbox",
    description:
      "Returns the consent URL of the provider (gmail or outlook) to send the browser to. The provider returns the user to the callback, which finishes the connection. The mailbox is connected for sending only.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: { dailySendLimit: { type: "integer", minimum: 1 } },
    },
  })
  authorize(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("provider") provider: string,
    @Body() input: unknown,
  ) {
    return this.sources.authorizeUrl(
      this.mailboxProvider(provider),
      actorOf(workspace),
      { dailySendLimit: body(input).dailySendLimit },
    );
  }

  @Get(":provider/callback")
  @AllowAnonymous()
  @ApiExcludeEndpoint()
  async callback(
    @Req() request: { session?: AuthSession | null },
    @Res() reply: RedirectReply,
    @Param("provider") provider: string,
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
  ) {
    const mailbox = this.mailboxProvider(provider);
    const outcome = await this.sources.oauthCallback(
      mailbox,
      request.session?.user.id ?? null,
      { code, state, error },
    );
    const base = this.config
      .get("BETTER_AUTH_URL", { infer: true })
      .replace(/\/+$/, "");
    const query = outcome.ok
      ? `${outcome.result}=${mailbox}`
      : `connect_error=${encodeURIComponent(outcome.code)}&provider=${mailbox}`;
    return reply
      .code(302)
      .header("location", `${base}/app/integrations?${query}`)
      .send();
  }

  @Post(":id/reply-detection")
  @HttpCode(200)
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Start turning on reply detection for a mailbox",
    description:
      "Returns the consent URL that asks the provider for read access to the mailbox. Reply detection turns on when the user returns and the read permission was granted.",
  })
  enableReplyDetection(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.sources.replyDetectionAuthorizeUrl(actorOf(workspace), id);
  }

  @Delete(":id/reply-detection")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Turn off reply detection for a mailbox",
    description:
      "Stops reading the mailbox. The permission itself stays granted until it is removed in the provider account.",
  })
  disableReplyDetection(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.sources.disableReplyDetection(actorOf(workspace), id);
  }

  @Put(":id/event-topic")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Set the SNS topic an Amazon SES source receives events from",
    description:
      "Saves the topic ARN that bounce and complaint notifications must come from. When the source has a configuration set and the access key allows it, the event destination is created in Amazon SES as well.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["topicArn"],
      properties: { topicArn: { type: "string" } },
    },
  })
  setEventTopic(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.sources.setEventTopic(actorOf(workspace), id, {
      topicArn: body(input).topicArn,
    });
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

  private mailboxProvider(provider: string) {
    if (!isMailboxProvider(provider)) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "not_found",
        "This kind of mailbox cannot be connected with a sign-in.",
      );
    }
    return provider;
  }
}
