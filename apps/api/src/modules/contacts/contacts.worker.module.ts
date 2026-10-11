import { Module } from "@nestjs/common";
import { ListsWorkerModule } from "../lists/lists.worker.module";
import { SuppressionWorkerModule } from "../suppression/suppression.worker.module";
import { TagsWorkerModule } from "../tags/tags.worker.module";
import { ContactsRepository } from "./contacts.repository";
import { ContactsService } from "./contacts.service";

@Module({
  imports: [ListsWorkerModule, TagsWorkerModule, SuppressionWorkerModule],
  providers: [ContactsRepository, ContactsService],
  exports: [ContactsService],
})
export class ContactsWorkerModule {}
