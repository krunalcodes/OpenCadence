import { Module } from "@nestjs/common";
import { formsQueues } from "./forms.module";
import { FormsRepository } from "./forms.repository";
import { FormsMaintenanceProcessor } from "./jobs/forms-maintenance.processor";

@Module({
  imports: [formsQueues],
  providers: [FormsRepository, FormsMaintenanceProcessor],
})
export class FormsWorkerModule {}
