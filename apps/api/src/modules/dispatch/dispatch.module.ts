import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { QueueBoard } from "../../infra/queue/queue-board.service";
import { IntegrationsModule } from "../integrations/integrations.module";
import { SuppressionModule } from "../suppression/suppression.module";
import { ContentArchive } from "./content-archive";
import { DISPATCH_MAINTENANCE_QUEUE, SEND_QUEUE } from "./dispatch.constants";
import { DispatchRepository } from "./dispatch.repository";
import { DispatchService } from "./dispatch.service";

export const dispatchQueues = BullModule.registerQueue(
  { name: SEND_QUEUE },
  { name: DISPATCH_MAINTENANCE_QUEUE },
);

@Module({
  imports: [dispatchQueues, IntegrationsModule, SuppressionModule],
  providers: [ContentArchive, DispatchRepository, DispatchService],
  exports: [DispatchService],
})
export class DispatchModule implements OnModuleInit {
  constructor(
    @InjectQueue(SEND_QUEUE) private readonly sendQueue: Queue,
    @InjectQueue(DISPATCH_MAINTENANCE_QUEUE)
    private readonly maintenanceQueue: Queue,
    @Inject(QueueBoard) private readonly board: QueueBoard,
  ) {}

  onModuleInit() {
    this.board.register(this.sendQueue);
    this.board.register(this.maintenanceQueue);
  }
}
