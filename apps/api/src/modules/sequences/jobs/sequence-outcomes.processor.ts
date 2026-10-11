import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  type MessageOutcomeJob,
  SEQUENCE_OUTCOMES_QUEUE,
} from "../../dispatch/dispatch.constants";
import { SequenceOutcomes } from "../sequence-outcomes";

@Processor(SEQUENCE_OUTCOMES_QUEUE, { concurrency: 5 })
export class SequenceOutcomesProcessor extends WorkerHost {
  constructor(
    @Inject(SequenceOutcomes) private readonly outcomes: SequenceOutcomes,
  ) {
    super();
  }

  process(job: Job<MessageOutcomeJob>) {
    return this.outcomes.apply(job.data);
  }
}
