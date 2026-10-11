import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { QueueBoard } from "../../infra/queue/queue-board.service";
import { AdapterRegistry } from "./adapter-registry";
import { CredentialsService } from "./credentials.service";
import { MAINTENANCE_QUEUE } from "./jobs/maintenance.processor";
import { SendCounter } from "./send-counter";
import { SendingSourcesController } from "./sending-sources.controller";
import { SendingSourcesRepository } from "./sending-sources.repository";
import { SendingSourcesService } from "./sending-sources.service";

export const integrationsProviders = [
  AdapterRegistry,
  CredentialsService,
  SendCounter,
  SendingSourcesRepository,
  SendingSourcesService,
];

@Module({
  imports: [BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  controllers: [SendingSourcesController],
  providers: [...integrationsProviders, WorkspaceAuthGuard],
  exports: [SendingSourcesService],
})
export class IntegrationsModule implements OnModuleInit {
  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
    @Inject(QueueBoard) private readonly board: QueueBoard,
  ) {}

  onModuleInit() {
    this.board.register(this.queue);
  }
}
