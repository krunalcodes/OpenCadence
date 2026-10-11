import {
  Body,
  Controller,
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
import { InboxService } from "./inbox.service";

@ApiTags("inbox")
@Controller("inbox")
export class InboxController {
  constructor(@Inject(InboxService) private readonly inbox: InboxService) {}

  @Get("summary")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Count unread conversations",
    description: "The number of open conversations with an unread reply.",
  })
  summary(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.inbox.summary(workspace.workspaceId);
  }

  @Get("threads")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List conversations",
    description:
      "Replies to campaigns and sequences, grouped by the email that was answered, newest first. Pass nextCursor back as cursor to read the next page.",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["open", "closed", "all"],
  })
  @ApiQuery({ name: "unread", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "sourceId", required: false })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Matches the contact's address or name, or the subject.",
  })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 30 },
  })
  list(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Query("status") status?: string,
    @Query("unread") unread?: string,
    @Query("sourceId") sourceId?: string,
    @Query("search") search?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.inbox.list(workspace.workspaceId, {
      status: status || undefined,
      unread: unread || undefined,
      sourceId: sourceId || undefined,
      search: search || undefined,
      cursor: cursor || undefined,
      limit: limit ? Number(limit) || undefined : undefined,
    });
  }

  @Get("threads/:id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Read a conversation",
    description:
      "The conversation with its messages, oldest first, starting with the email that was answered. Reading does not mark the conversation as read. Every html value is reduced to a small set of formatting tags and never loads an image.",
  })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.inbox.get(workspace.workspaceId, id);
  }

  @Post("threads/:id/read")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Mark a conversation as read" })
  read(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.inbox.update(workspace.workspaceId, id, { unread: false });
  }

  @Post("threads/:id/unread")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Mark a conversation as unread" })
  unread(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.inbox.update(workspace.workspaceId, id, { unread: true });
  }

  @Post("threads/:id/close")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Close a conversation",
    description: "A new reply from the contact opens it again.",
  })
  close(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.inbox.update(workspace.workspaceId, id, { status: "closed" });
  }

  @Post("threads/:id/reopen")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Reopen a conversation" })
  reopen(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.inbox.update(workspace.workspaceId, id, { status: "open" });
  }

  @Post("threads/:id/reply")
  @HttpCode(202)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Reply to a conversation",
    description:
      "Sends from the mailbox the conversation came through, in the same email thread. The reply carries no tracking and no unsubscribe footer, counts toward the mailbox's daily limit, and is not sent to an address that bounced, complained or was blocked by hand. The conversation is reopened and marked as read.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", minLength: 1, maxLength: 100000 },
        html: { type: "string", maxLength: 400000 },
      },
    },
  })
  reply(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.inbox.reply(workspace, id, input);
  }
}
