import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import {
  planEveryMs,
  pruneEveryMs,
  sendDueEveryMs,
  syncEveryMs,
  WARMUP_QUEUE,
  type WarmupScope,
  warmupJobs,
} from "../warmup.constants";
import { WarmupEngine } from "../warmup.engine";

const schedules: [string, number][] = [
  [warmupJobs.plan, planEveryMs],
  [warmupJobs.sendDue, sendDueEveryMs],
  [warmupJobs.sync, syncEveryMs],
  [warmupJobs.prune, pruneEveryMs],
];

@Processor(WARMUP_QUEUE)
export class WarmupProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(WARMUP_QUEUE) private readonly queue: Queue,
    @Inject(WarmupEngine) private readonly engine: WarmupEngine,
  ) {
    super();
  }

  async onModuleInit() {
    for (const [name, every] of schedules) {
      await this.queue.upsertJobScheduler(
        name,
        { every },
        { name, opts: { attempts: 1 } },
      );
    }
  }

  async process(job: Job) {
    if (job.name === warmupJobs.plan) {
      return this.plan();
    }
    if (job.name === warmupJobs.sendDue) {
      return this.sendDue();
    }
    if (job.name === warmupJobs.sync) {
      return this.sync();
    }
    if (job.name === warmupJobs.prune) {
      return this.prune();
    }
    return null;
  }

  plan(now?: Date, scope?: WarmupScope) {
    return this.engine.plan(now, scope);
  }

  sendDue(now?: Date, scope?: WarmupScope) {
    return this.engine.sendDue(now, scope);
  }

  sync(now?: Date, scope?: WarmupScope) {
    return this.engine.sync(now, scope);
  }

  prune(now?: Date) {
    return this.engine.prune(now);
  }
}
