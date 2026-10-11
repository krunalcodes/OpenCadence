import { Inject, Injectable } from "@nestjs/common";
import { messageRetentionMonths } from "../dispatch/dispatch.constants";
import { maxRetentionBatches, retentionBatchSize } from "./inbox.constants";
import { InboxRepository } from "./inbox.repository";

export function retentionCutoff(now: Date) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - messageRetentionMonths);
  return cutoff;
}

@Injectable()
export class InboxRetention {
  constructor(
    @Inject(InboxRepository) private readonly repository: InboxRepository,
  ) {}

  async run(now = new Date(), batchSize = retentionBatchSize) {
    const before = retentionCutoff(now);
    let messages = 0;
    let threads = 0;
    for (let batch = 0; batch < maxRetentionBatches; batch += 1) {
      const changes = await this.repository.deleteMessagesBefore(
        before,
        batchSize,
      );
      const removed = changes.reduce((sum, change) => sum + change.removed, 0);
      messages += removed;
      threads += await this.repository.shrinkThreads(changes);
      if (removed < batchSize) {
        break;
      }
    }
    return { messages, threads };
  }
}
