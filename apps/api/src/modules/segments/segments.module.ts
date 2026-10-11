import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { ContactsModule } from "../contacts/contacts.module";
import { SegmentsController } from "./segments.controller";
import { SegmentsRepository } from "./segments.repository";
import { SegmentsService } from "./segments.service";

@Module({
  imports: [ContactsModule],
  controllers: [SegmentsController],
  providers: [SegmentsRepository, SegmentsService, WorkspaceAuthGuard],
  exports: [SegmentsService],
})
export class SegmentsModule {}
