import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { QueueBoard } from "../../infra/queue/queue-board.service";
import { BrandModule } from "../brand/brand.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DispatchModule } from "../dispatch/dispatch.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { SegmentsModule } from "../segments/segments.module";
import { TemplatesModule } from "../templates/templates.module";
import {
  CAMPAIGN_FANOUT_QUEUE,
  CAMPAIGN_MAINTENANCE_QUEUE,
} from "./campaigns.constants";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsRepository } from "./campaigns.repository";
import { CampaignsService } from "./campaigns.service";

export const campaignsQueues = BullModule.registerQueue(
  { name: CAMPAIGN_FANOUT_QUEUE },
  { name: CAMPAIGN_MAINTENANCE_QUEUE },
);

@Module({
  imports: [
    campaignsQueues,
    BrandModule,
    ContactsModule,
    DispatchModule,
    IntegrationsModule,
    SegmentsModule,
    TemplatesModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsRepository, CampaignsService, WorkspaceAuthGuard],
  exports: [CampaignsService],
})
export class CampaignsModule implements OnModuleInit {
  constructor(
    @InjectQueue(CAMPAIGN_FANOUT_QUEUE) private readonly fanoutQueue: Queue,
    @InjectQueue(CAMPAIGN_MAINTENANCE_QUEUE)
    private readonly maintenanceQueue: Queue,
    @Inject(QueueBoard) private readonly board: QueueBoard,
  ) {}

  onModuleInit() {
    this.board.register(this.fanoutQueue);
    this.board.register(this.maintenanceQueue);
  }
}
