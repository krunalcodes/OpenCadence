import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { QueueBoard } from "../../infra/queue/queue-board.service";
import { IntegrationsModule } from "../integrations/integrations.module";
import { SystemDnsResolver } from "./dns-resolver";
import { DNS_RESOLVER, DOMAIN_CHECKS_QUEUE } from "./domains.constants";
import { DomainsController } from "./domains.controller";
import { DomainCheckLimiter } from "./domains.rate-limiter";
import { DomainsRepository } from "./domains.repository";
import { DomainsService } from "./domains.service";

export const domainsQueues = BullModule.registerQueue({
  name: DOMAIN_CHECKS_QUEUE,
});

export const domainsProviders = [
  { provide: DNS_RESOLVER, useClass: SystemDnsResolver },
  DomainsRepository,
  DomainCheckLimiter,
  DomainsService,
];

@Module({
  imports: [domainsQueues, IntegrationsModule],
  controllers: [DomainsController],
  providers: [...domainsProviders, WorkspaceAuthGuard],
  exports: [DomainsService],
})
export class DomainsModule implements OnModuleInit {
  constructor(
    @InjectQueue(DOMAIN_CHECKS_QUEUE) private readonly queue: Queue,
    @Inject(QueueBoard) private readonly board: QueueBoard,
  ) {}

  onModuleInit() {
    this.board.register(this.queue);
  }
}
