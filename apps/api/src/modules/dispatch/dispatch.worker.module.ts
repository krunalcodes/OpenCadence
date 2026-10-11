import { Module } from "@nestjs/common";
import { IntegrationsWorkerModule } from "../integrations/integrations.worker.module";
import { SuppressionWorkerModule } from "../suppression/suppression.worker.module";
import { dispatchProviders, dispatchQueues } from "./dispatch.module";
import { DispatchService } from "./dispatch.service";
import { DispatchMaintenanceProcessor } from "./jobs/dispatch-maintenance.processor";
import { SendProcessor } from "./jobs/send.processor";
import { SendRateLimiter } from "./send-rate-limiter";

@Module({
  imports: [dispatchQueues, IntegrationsWorkerModule, SuppressionWorkerModule],
  providers: [
    ...dispatchProviders,
    DispatchMaintenanceProcessor,
    SendProcessor,
    SendRateLimiter,
  ],
  exports: [DispatchService],
})
export class DispatchWorkerModule {}
