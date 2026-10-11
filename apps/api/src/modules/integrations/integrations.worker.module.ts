import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { integrationsProviders } from "./integrations.module";
import {
  MAINTENANCE_QUEUE,
  MaintenanceProcessor,
} from "./jobs/maintenance.processor";

@Module({
  imports: [BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  providers: [...integrationsProviders, MaintenanceProcessor],
  exports: [...integrationsProviders],
})
export class IntegrationsWorkerModule {}
