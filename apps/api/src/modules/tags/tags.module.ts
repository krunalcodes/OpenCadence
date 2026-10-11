import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { TagsController } from "./tags.controller";
import { TagsRepository } from "./tags.repository";
import { TagsService } from "./tags.service";

@Module({
  controllers: [TagsController],
  providers: [TagsRepository, TagsService, WorkspaceAuthGuard],
  exports: [TagsService],
})
export class TagsModule {}
