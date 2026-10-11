import { Module } from "@nestjs/common";
import { IntegrationsWorkerModule } from "../integrations/integrations.worker.module";
import { SuppressionWorkerModule } from "../suppression/suppression.worker.module";
import { ContentArchive } from "./content-archive";
import { dispatchQueues } from "./dispatch.module";
import { DispatchRepository } from "./dispatch.repository";
import { DispatchMaintenanceProcessor } from "./jobs/dispatch-maintenance.processor";
import { SendProcessor } from "./jobs/send.processor";
import { SendRateLimiter } from "./send-rate-limiter";

@Module({
  imports: [dispatchQueues, IntegrationsWorkerModule, SuppressionWorkerModule],
  providers: [
    ContentArchive,
    DispatchMaintenanceProcessor,
    DispatchRepository,
    SendProcessor,
    SendRateLimiter,
  ],
})
export class DispatchWorkerModule {}
