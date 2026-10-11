import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  StreamableFile,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { chunkSize, maxChunkIndex, maxFileSize } from "./imports.constants";
import { type ImportActor, ImportsService } from "./imports.service";

function actorOf(context: WorkspaceAuthContext): ImportActor {
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

@ApiTags("imports")
@Controller("imports")
export class ImportsController {
  constructor(
    @Inject(ImportsService) private readonly imports: ImportsService,
  ) {}

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Begin a CSV upload",
    description:
      "Returns an id and the chunk size. Split the file text into chunks of at most that many characters, send each one, then finish the upload. An upload that is not finished within two hours expires.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["fileName", "fileSize"],
      properties: {
        fileName: { type: "string", maxLength: 255 },
        fileSize: { type: "integer", minimum: 1, maximum: maxFileSize },
      },
    },
  })
  create(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    const { fileName, fileSize } = body(input);
    return this.imports.create(actorOf(workspace), { fileName, fileSize });
  }

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List imports",
    description: "The 50 most recent imports of the workspace, newest first.",
  })
  list(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.imports.list(workspace.workspaceId);
  }

  @Put(":id/chunks/:index")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Send one chunk of the file",
    description: `The index starts at 0 and goes up to ${maxChunkIndex}. Sending an index again replaces that chunk.`,
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["data"],
      properties: { data: { type: "string", maxLength: chunkSize } },
    },
  })
  async putChunk(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Param("index") index: string,
    @Body() input: unknown,
  ) {
    await this.imports.putChunk(workspace.workspaceId, id, index, {
      data: body(input).data,
    });
  }

  @Post(":id/uploaded")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Finish the upload",
    description:
      "Checks that every chunk arrived and reads the header row and the first five rows, so the columns can be mapped before the import starts.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["chunks"],
      properties: {
        chunks: { type: "integer", minimum: 1, maximum: maxChunkIndex + 1 },
      },
    },
  })
  finishUpload(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.imports.finishUpload(workspace.workspaceId, id, {
      chunks: body(input).chunks,
    });
  }

  @Post(":id/start")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Start the import",
    description:
      "Maps each column to a contact field and queues the import. Targets are email, firstName, lastName, company, jobTitle, phone, city, country, timezone, custom:<field key> or skip. Exactly one column must map to email. Rows are added to the given lists and tags.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["mapping", "updateExisting"],
      properties: {
        mapping: { type: "object", additionalProperties: { type: "string" } },
        updateExisting: { type: "boolean" },
        listIds: { type: "array", items: { type: "string", format: "uuid" } },
        tagIds: { type: "array", items: { type: "string", format: "uuid" } },
      },
    },
  })
  start(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const { mapping, updateExisting, listIds, tagIds } = body(input);
    return this.imports.start(workspace.workspaceId, id, {
      mapping,
      updateExisting,
      listIds,
      tagIds,
    });
  }

  @Get(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Get an import",
    description: "Poll this while an import runs to follow its progress.",
  })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.imports.get(workspace.workspaceId, id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Cancel an import",
    description:
      "Stops an import that has not finished. Contacts that were already imported are kept.",
  })
  cancel(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.imports.cancel(workspace.workspaceId, id);
  }

  @Get(":id/errors")
  @WorkspaceAuth("session", "apiKey")
  @ApiProduces("text/csv")
  @ApiOperation({
    summary: "Download the error report",
    description:
      "A CSV of the rows that could not be imported, with the reason in a leading error column.",
  })
  async errors(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    const report = await this.imports.errorReport(workspace.workspaceId, id);
    return new StreamableFile(report.content, {
      type: "text/csv; charset=utf-8",
      disposition: `attachment; filename="${report.fileName}"`,
      length: report.content.length,
    });
  }
}
