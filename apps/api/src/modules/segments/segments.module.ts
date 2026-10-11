import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { ContactsModule } from "../contacts/contacts.module";
import { AudienceController } from "./audience.controller";
import { AudienceRepository } from "./audience.repository";
import { AudienceService } from "./audience.service";
import { SegmentsController } from "./segments.controller";
import { SegmentsRepository } from "./segments.repository";
import { SegmentsService } from "./segments.service";

@Module({
  imports: [ContactsModule],
  controllers: [SegmentsController, AudienceController],
  providers: [
    SegmentsRepository,
    SegmentsService,
    AudienceRepository,
    AudienceService,
    WorkspaceAuthGuard,
  ],
  exports: [SegmentsService, AudienceService],
})
export class SegmentsModule {}
