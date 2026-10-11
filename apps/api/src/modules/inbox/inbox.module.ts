import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { QueueBoard } from "../../infra/queue/queue-board.service";
import { CampaignsModule } from "../campaigns/campaigns.module";
import { DispatchModule } from "../dispatch/dispatch.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { SequencesModule } from "../sequences/sequences.module";
import { SuppressionModule } from "../suppression/suppression.module";
import { INBOX_MAINTENANCE_QUEUE, INBOX_POLL_QUEUE } from "./inbox.constants";
import { InboxController } from "./inbox.controller";
import { InboxRepository } from "./inbox.repository";
import { InboxService } from "./inbox.service";
import { InboxRetention } from "./inbox-retention";
import { MailPoller } from "./mail-poller";

export const inboxQueues = BullModule.registerQueue(
  { name: INBOX_POLL_QUEUE },
  { name: INBOX_MAINTENANCE_QUEUE },
);

export const inboxProviders = [InboxRepository, MailPoller, InboxRetention];

@Module({
  imports: [
    inboxQueues,
    CampaignsModule,
    DispatchModule,
    IntegrationsModule,
    SequencesModule,
    SuppressionModule,
  ],
  controllers: [InboxController],
  providers: [...inboxProviders, InboxService, WorkspaceAuthGuard],
  exports: [InboxService],
})
export class InboxModule implements OnModuleInit {
  constructor(
    @InjectQueue(INBOX_POLL_QUEUE) private readonly pollQueue: Queue,
    @InjectQueue(INBOX_MAINTENANCE_QUEUE)
    private readonly maintenanceQueue: Queue,
    @Inject(QueueBoard) private readonly board: QueueBoard,
  ) {}

  onModuleInit() {
    this.board.register(this.pollQueue);
    this.board.register(this.maintenanceQueue);
  }
}
