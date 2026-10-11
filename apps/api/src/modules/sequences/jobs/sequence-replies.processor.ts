import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { ReplyDetector } from "../reply-detector";
import {
  repliesEveryMs,
  SEQUENCE_REPLIES_QUEUE,
  sequenceJobs,
} from "../sequences.constants";

@Processor(SEQUENCE_REPLIES_QUEUE)
export class SequenceRepliesProcessor
  extends WorkerHost
  implements OnModuleInit
{
  constructor(
    @InjectQueue(SEQUENCE_REPLIES_QUEUE) private readonly queue: Queue,
    @Inject(ReplyDetector) private readonly detector: ReplyDetector,
  ) {
    super();
  }

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      sequenceJobs.replies,
      { every: repliesEveryMs },
      { name: sequenceJobs.replies, opts: { attempts: 1 } },
    );
  }

  process() {
    return this.detector.run();
  }
}
