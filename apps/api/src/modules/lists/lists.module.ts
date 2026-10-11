import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { ListsController } from "./lists.controller";
import { ListsRepository } from "./lists.repository";
import { ListsService } from "./lists.service";

@Module({
  controllers: [ListsController],
  providers: [ListsRepository, ListsService, WorkspaceAuthGuard],
  exports: [ListsService],
})
export class ListsModule {}
