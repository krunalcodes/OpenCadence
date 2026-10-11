import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { QueueBoard } from "../../infra/queue/queue-board.service";
import { IntegrationsModule } from "../integrations/integrations.module";
import { SuppressionModule } from "../suppression/suppression.module";
import { ContentArchive } from "./content-archive";
import {
  CAMPAIGN_OUTCOMES_QUEUE,
  DISPATCH_MAINTENANCE_QUEUE,
  SEND_QUEUE,
  SEQUENCE_OUTCOMES_QUEUE,
} from "./dispatch.constants";
import { DispatchRepository } from "./dispatch.repository";
import { DispatchService } from "./dispatch.service";
import { MessageEvents } from "./message-events";

export const dispatchQueues = BullModule.registerQueue(
  { name: SEND_QUEUE },
  { name: DISPATCH_MAINTENANCE_QUEUE },
  { name: CAMPAIGN_OUTCOMES_QUEUE },
  { name: SEQUENCE_OUTCOMES_QUEUE },
);

export const dispatchProviders = [
  ContentArchive,
  DispatchRepository,
  MessageEvents,
  DispatchService,
];

@Module({
  imports: [dispatchQueues, IntegrationsModule, SuppressionModule],
  providers: dispatchProviders,
  exports: [DispatchService],
})
export class DispatchModule implements OnModuleInit {
  constructor(
    @InjectQueue(SEND_QUEUE) private readonly sendQueue: Queue,
    @InjectQueue(DISPATCH_MAINTENANCE_QUEUE)
    private readonly maintenanceQueue: Queue,
    @InjectQueue(CAMPAIGN_OUTCOMES_QUEUE)
    private readonly campaignOutcomes: Queue,
    @InjectQueue(SEQUENCE_OUTCOMES_QUEUE)
    private readonly sequenceOutcomes: Queue,
    @Inject(QueueBoard) private readonly board: QueueBoard,
  ) {}

  onModuleInit() {
    this.board.register(this.sendQueue);
    this.board.register(this.maintenanceQueue);
    this.board.register(this.campaignOutcomes);
    this.board.register(this.sequenceOutcomes);
  }
}
