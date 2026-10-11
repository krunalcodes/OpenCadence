import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, type OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { SequenceRunner } from "../sequence-runner";
import {
  reconcileEveryMs,
  SEQUENCE_TICK_QUEUE,
  sequenceJobs,
  tickEveryMs,
} from "../sequences.constants";

@Processor(SEQUENCE_TICK_QUEUE)
export class SequenceTickProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(SEQUENCE_TICK_QUEUE) private readonly queue: Queue,
    @Inject(SequenceRunner) private readonly runner: SequenceRunner,
  ) {
    super();
  }

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      sequenceJobs.tick,
      { every: tickEveryMs },
      { name: sequenceJobs.tick, opts: { attempts: 1 } },
    );
    await this.queue.upsertJobScheduler(
      sequenceJobs.reconcile,
      { every: reconcileEveryMs },
      { name: sequenceJobs.reconcile, opts: { attempts: 1 } },
    );
  }

  async process(job: Job) {
    if (job.name === sequenceJobs.tick) {
      return this.runner.tick();
    }
    if (job.name === sequenceJobs.reconcile) {
      return this.runner.reconcile();
    }
    return null;
  }
}
