import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { MediaService } from "./media.service";

type PublicReply = { header(name: string, value: string): unknown };

@ApiTags("media")
@Controller("media")
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Get()
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "List uploaded images",
    description:
      "Images uploaded to the workspace, newest first. Pass nextCursor back as cursor to read the next page.",
  })
  list(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.media.list(workspace.workspaceId, {
      cursor: cursor || undefined,
      limit: limit ? Number(limit) || undefined : undefined,
    });
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Delete an image",
    description:
      "Removes the image and its file. Emails that already use its address will show a broken image. If it was the brand logo, the brand is left without a logo.",
  })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.media.remove(workspace.workspaceId, id);
  }

  @Get(":id/:fileName")
  @AllowAnonymous()
  @ApiOperation({
    summary: "Read an image",
    description:
      "Public address of an uploaded image, for use in emails. The file name is only for display; the image is found by its id.",
  })
  @ApiProduces("image/png", "image/jpeg", "image/gif", "image/webp")
  async read(
    @Param("id") id: string,
    @Res({ passthrough: true }) reply: PublicReply,
  ) {
    const file = await this.media.read(id);
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "default-src 'none'");
    return new StreamableFile(file.body, {
      type: file.contentType,
      length: file.body.length,
    });
  }
}
