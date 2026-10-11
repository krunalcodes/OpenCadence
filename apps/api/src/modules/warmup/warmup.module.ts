import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { QueueBoard } from "../../infra/queue/queue-board.service";
import { IntegrationsModule } from "../integrations/integrations.module";
import { WARMUP_QUEUE, WARMUP_RANDOM } from "./warmup.constants";
import { WarmupController } from "./warmup.controller";
import { WarmupRepository } from "./warmup.repository";
import { WarmupService } from "./warmup.service";

export const warmupQueues = BullModule.registerQueue({ name: WARMUP_QUEUE });

export const warmupRandomProvider = {
  provide: WARMUP_RANDOM,
  useValue: Math.random,
};

@Module({
  imports: [warmupQueues, IntegrationsModule],
  controllers: [WarmupController],
  providers: [
    warmupRandomProvider,
    WarmupRepository,
    WarmupService,
    WorkspaceAuthGuard,
  ],
  exports: [WarmupService],
})
export class WarmupModule implements OnModuleInit {
  constructor(
    @InjectQueue(WARMUP_QUEUE) private readonly queue: Queue,
    @Inject(QueueBoard) private readonly board: QueueBoard,
  ) {}

  onModuleInit() {
    this.board.register(this.queue);
  }
}
