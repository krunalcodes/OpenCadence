import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { INBOX_POLL_QUEUE, inboxJobs, pollEveryMs } from "../inbox.constants";
import { MailPoller } from "../mail-poller";

@Processor(INBOX_POLL_QUEUE)
export class InboxPollProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectQueue(INBOX_POLL_QUEUE) private readonly queue: Queue,
    @Inject(MailPoller) private readonly poller: MailPoller,
  ) {
    super();
  }

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      inboxJobs.poll,
      { every: pollEveryMs },
      { name: inboxJobs.poll, opts: { attempts: 1 } },
    );
  }

  process() {
    return this.poller.run();
  }
}
