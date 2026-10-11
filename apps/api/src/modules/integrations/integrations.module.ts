import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { AdapterRegistry } from "./adapter-registry";
import { CredentialsService } from "./credentials.service";
import {
  MAINTENANCE_QUEUE,
  MaintenanceProcessor,
} from "./jobs/maintenance.processor";
import { SendCounter } from "./send-counter";
import { SendingSourcesController } from "./sending-sources.controller";
import { SendingSourcesRepository } from "./sending-sources.repository";
import { SendingSourcesService } from "./sending-sources.service";

@Module({
  imports: [BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  controllers: [SendingSourcesController],
  providers: [
    AdapterRegistry,
    CredentialsService,
    MaintenanceProcessor,
    SendCounter,
    SendingSourcesRepository,
    SendingSourcesService,
    WorkspaceAuthGuard,
  ],
  exports: [SendingSourcesService],
})
export class IntegrationsModule {}
