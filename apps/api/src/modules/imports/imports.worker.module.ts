import { Module } from "@nestjs/common";
import { ContactsWorkerModule } from "../contacts/contacts.worker.module";
import { ImportFiles } from "./import-files";
import { importsQueues } from "./imports.module";
import { ImportsRepository } from "./imports.repository";
import { ImportContactsProcessor } from "./jobs/import-contacts.processor";

@Module({
  imports: [importsQueues, ContactsWorkerModule],
  providers: [ImportContactsProcessor, ImportFiles, ImportsRepository],
})
export class ImportsWorkerModule {}
