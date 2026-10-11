import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import {
  DOMAIN_CHECKS_QUEUE,
  domainCheckJobs,
  runDueEveryMs,
} from "../domains.constants";
import { type DomainCheckScope, DomainsService } from "../domains.service";

@Processor(DOMAIN_CHECKS_QUEUE)
export class DomainChecksProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(DOMAIN_CHECKS_QUEUE) private readonly queue: Queue,
    @Inject(DomainsService) private readonly domains: DomainsService,
  ) {
    super();
  }

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      domainCheckJobs.runDue,
      { every: runDueEveryMs },
      { name: domainCheckJobs.runDue, opts: { attempts: 1 } },
    );
  }

  async process(job: Job) {
    if (job.name === domainCheckJobs.runDue) {
      return this.runDue();
    }
    return null;
  }

  runDue(now?: Date, scope?: DomainCheckScope) {
    return this.domains.runDue(now, scope);
  }
}
