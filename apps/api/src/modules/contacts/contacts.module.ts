import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { ListsModule } from "../lists/lists.module";
import { SuppressionModule } from "../suppression/suppression.module";
import { TagsModule } from "../tags/tags.module";
import { ContactFieldsController } from "./contact-fields.controller";
import { ContactsController } from "./contacts.controller";
import { ContactsRepository } from "./contacts.repository";
import { ContactsService } from "./contacts.service";

@Module({
  imports: [ListsModule, TagsModule, SuppressionModule],
  controllers: [ContactsController, ContactFieldsController],
  providers: [ContactsRepository, ContactsService, WorkspaceAuthGuard],
  exports: [ContactsService],
})
export class ContactsModule {}
