import { Readable } from "node:stream";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Res,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import {
  assertCanManageWorkspace,
  canManageWorkspace,
} from "../../common/workspace-role";
import { AiService } from "./ai.service";

type StreamReply = {
  raw: {
    writableFinished: boolean;
    once(event: "close", listener: () => void): unknown;
  };
  header(name: string, value: string): StreamReply;
  send(payload: Readable): unknown;
};

function body(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function disconnectSignal(reply: StreamReply) {
  const controller = new AbortController();
  reply.raw.once("close", () => {
    if (!reply.raw.writableFinished) {
      controller.abort();
    }
  });
  return controller.signal;
}

function sendText(reply: StreamReply, chunks: AsyncGenerator<string>) {
  return reply
    .header("content-type", "text/plain; charset=utf-8")
    .header("cache-control", "no-store")
    .header("x-accel-buffering", "no")
    .header("x-content-type-options", "nosniff")
    .send(Readable.from(chunks, { objectMode: false }));
}

@ApiTags("ai")
@Controller("ai")
export class AiController {
  constructor(@Inject(AiService) private readonly ai: AiService) {}

  @Get("settings")
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Get the AI provider settings",
    description:
      "The OpenAI-compatible endpoint and model the writing assistant uses. The API key is never returned, only its last 4 characters.",
  })
  async getSettings(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return {
      ...(await this.ai.getSettings(workspace.workspaceId)),
      canManage: canManageWorkspace(workspace),
    };
  }

  @Put("settings")
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Save the AI provider settings",
    description:
      "Owners and admins only. The API key is required the first time and whenever the endpoint host changes; leave it out to keep the saved key.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["baseUrl", "model"],
      properties: {
        baseUrl: { type: "string", maxLength: 500 },
        model: { type: "string", maxLength: 200 },
        apiKey: { type: "string", maxLength: 500 },
      },
    },
  })
  async saveSettings(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    const actor = this.manager(workspace);
    return {
      ...(await this.ai.saveSettings(actor, body(input))),
      canManage: true,
    };
  }

  @Delete("settings")
  @HttpCode(204)
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Remove the AI provider settings",
    description: "Owners and admins only. Deletes the saved API key.",
  })
  async deleteSettings(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    const actor = this.manager(workspace);
    await this.ai.deleteSettings(actor.workspaceId);
  }

  @Post("settings/test")
  @HttpCode(200)
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Test the saved AI provider settings",
    description:
      "Owners and admins only. Sends one short request to the provider. A failure returns 502 with the code ai_provider_error.",
  })
  testSettings(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Res({ passthrough: true }) reply: StreamReply,
  ) {
    const actor = this.manager(workspace);
    return this.ai.testSettings(actor.workspaceId, disconnectSignal(reply));
  }

  @Post("draft")
  @HttpCode(200)
  @WorkspaceAuth("session")
  @ApiProduces("text/plain")
  @ApiOperation({
    summary: "Draft or revise an email",
    description:
      "Streams plain text: a subject, a preview and a body tag holding an HTML fragment. Send currentHtml to revise an existing email. An error after the stream has started ends it with an error tag holding the code.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", maxLength: 4000 },
        kind: {
          type: "string",
          enum: ["newsletter", "outreach", "announcement", "transactional"],
        },
        tone: { type: "string", maxLength: 200 },
        currentHtml: { type: "string", maxLength: 200000 },
        mergeTags: { type: "array", maxItems: 50, items: { type: "string" } },
      },
    },
  })
  async draft(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
    @Res() reply: StreamReply,
  ) {
    const chunks = await this.ai.draft(
      workspace.workspaceId,
      body(input),
      disconnectSignal(reply),
    );
    return sendText(reply, chunks);
  }

  @Post("rewrite")
  @HttpCode(200)
  @WorkspaceAuth("session")
  @ApiProduces("text/plain")
  @ApiOperation({
    summary: "Rewrite a passage of an email",
    description:
      "Streams the replacement as plain text, with merge tags kept as written.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["text", "action"],
      properties: {
        text: { type: "string", maxLength: 8000 },
        action: {
          type: "string",
          enum: [
            "shorten",
            "expand",
            "friendlier",
            "more_formal",
            "fix_grammar",
            "custom",
          ],
        },
        instruction: { type: "string", maxLength: 500 },
        context: { type: "string", maxLength: 8000 },
      },
    },
  })
  async rewrite(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
    @Res() reply: StreamReply,
  ) {
    const chunks = await this.ai.rewrite(
      workspace.workspaceId,
      body(input),
      disconnectSignal(reply),
    );
    return sendText(reply, chunks);
  }

  @Post("subjects")
  @HttpCode(200)
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Suggest subject lines and preview text",
    description:
      "Send the email as html or text. Subjects stay under 70 characters.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        html: { type: "string", maxLength: 200000 },
        text: { type: "string", maxLength: 200000 },
        current: { type: "string", maxLength: 998 },
        count: { type: "integer", minimum: 1, maximum: 8, default: 5 },
      },
    },
  })
  subjects(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
    @Res({ passthrough: true }) reply: StreamReply,
  ) {
    return this.ai.subjects(
      workspace.workspaceId,
      body(input),
      disconnectSignal(reply),
    );
  }

  @Post("review")
  @HttpCode(200)
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Review an email before sending",
    description:
      "Always runs the rule checks. When a provider is set up and answers, the model adds wording issues and aiReviewed is true.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["subject", "html"],
      properties: {
        subject: { type: "string", maxLength: 998 },
        previewText: { type: "string", maxLength: 300 },
        html: { type: "string", maxLength: 200000 },
      },
    },
  })
  review(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
    @Res({ passthrough: true }) reply: StreamReply,
  ) {
    return this.ai.review(
      workspace.workspaceId,
      body(input),
      disconnectSignal(reply),
    );
  }

  private manager(workspace: WorkspaceAuthContext) {
    assertCanManageWorkspace(workspace);
    if (workspace.method !== "session") {
      throw new Error("A session is required.");
    }
    return { workspaceId: workspace.workspaceId, userId: workspace.userId };
  }
}
