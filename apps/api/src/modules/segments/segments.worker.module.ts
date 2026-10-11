import { Module } from "@nestjs/common";
import { ContactsWorkerModule } from "../contacts/contacts.worker.module";
import { AudienceRepository } from "./audience.repository";
import { AudienceService } from "./audience.service";
import { SegmentsRepository } from "./segments.repository";
import { SegmentsService } from "./segments.service";

@Module({
  imports: [ContactsWorkerModule],
  providers: [
    SegmentsRepository,
    SegmentsService,
    AudienceRepository,
    AudienceService,
  ],
  exports: [SegmentsService, AudienceService],
})
export class SegmentsWorkerModule {}
