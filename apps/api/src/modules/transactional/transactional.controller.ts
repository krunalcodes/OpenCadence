import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { TransactionalService } from "./transactional.service";

@ApiTags("emails")
@Controller("emails")
export class TransactionalController {
  constructor(
    @Inject(TransactionalService)
    private readonly transactional: TransactionalService,
  ) {}

  @Post()
  @HttpCode(202)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Send an email",
    description:
      "Accepts one email and queues it for sending through a connected source. Recipients on the suppression list are removed; if none remain the email is skipped. Send the same Idempotency-Key again to get the first result back without sending twice.",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "1 to 256 characters. Kept for 24 hours.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["from", "to", "subject"],
      properties: {
        from: {
          type: "string",
          description:
            "An address, or a name and address: Ada <ada@example.com>",
        },
        to: {
          oneOf: [
            { type: "string", format: "email" },
            {
              type: "array",
              items: { type: "string", format: "email" },
              maxItems: 50,
            },
          ],
        },
        cc: { type: "array", items: { type: "string", format: "email" } },
        bcc: { type: "array", items: { type: "string", format: "email" } },
        replyTo: { type: "string", format: "email" },
        subject: { type: "string", maxLength: 998 },
        html: { type: "string" },
        text: { type: "string" },
        headers: { type: "object", additionalProperties: { type: "string" } },
        tags: { type: "object", additionalProperties: { type: "string" } },
        sourceId: {
          type: "string",
          format: "uuid",
          description: "Defaults to the workspace's default sending source.",
        },
      },
    },
  })
  send(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.transactional.send(
      workspace.workspaceId,
      input,
      idempotencyKey,
    );
  }

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List sent email",
    description:
      "Emails handed to OpenCadence for sending, newest first. Pass nextCursor back as cursor to read the next page.",
  })
  list(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Query("status") status?: string,
    @Query("sourceId") sourceId?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.transactional.list(workspace.workspaceId, {
      status: status || undefined,
      sourceId: sourceId || undefined,
      cursor: cursor || undefined,
      limit: limit ? Number(limit) || undefined : undefined,
    });
  }

  @Get(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Read one email",
    description:
      "Returns the status and, while it is still stored, the content of an email.",
  })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.transactional.get(workspace.workspaceId, id);
  }
}
