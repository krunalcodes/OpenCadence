import { Module } from "@nestjs/common";
import { ListsRepository } from "./lists.repository";
import { ListsService } from "./lists.service";

@Module({
  providers: [ListsRepository, ListsService],
  exports: [ListsService],
})
export class ListsWorkerModule {}
