import { Module } from "@nestjs/common";
import { BrandWorkerModule } from "../brand/brand.worker.module";
import { DispatchWorkerModule } from "../dispatch/dispatch.worker.module";
import { IntegrationsWorkerModule } from "../integrations/integrations.worker.module";
import { SegmentsWorkerModule } from "../segments/segments.worker.module";
import { CampaignsEngine } from "./campaigns.engine";
import { campaignsQueues } from "./campaigns.module";
import { CampaignsRepository } from "./campaigns.repository";
import { CampaignFanoutProcessor } from "./jobs/campaign-fanout.processor";
import { CampaignMaintenanceProcessor } from "./jobs/campaign-maintenance.processor";
import { CampaignOutcomesProcessor } from "./jobs/campaign-outcomes.processor";

@Module({
  imports: [
    campaignsQueues,
    BrandWorkerModule,
    DispatchWorkerModule,
    IntegrationsWorkerModule,
    SegmentsWorkerModule,
  ],
  providers: [
    CampaignsRepository,
    CampaignsEngine,
    CampaignFanoutProcessor,
    CampaignMaintenanceProcessor,
    CampaignOutcomesProcessor,
  ],
})
export class CampaignsWorkerModule {}
