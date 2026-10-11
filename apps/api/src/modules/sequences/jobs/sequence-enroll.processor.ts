import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { Job } from "bullmq";
import { EnrollmentsService } from "../enrollments.service";
import { type EnrollJob, SEQUENCE_ENROLL_QUEUE } from "../sequences.constants";

@Processor(SEQUENCE_ENROLL_QUEUE)
export class SequenceEnrollProcessor extends WorkerHost {
  constructor(
    @Inject(EnrollmentsService)
    private readonly enrollments: EnrollmentsService,
  ) {
    super();
  }

  process(job: Job<EnrollJob>) {
    return this.enrollments.enrollAudience(job.data, (afterContactId) =>
      job.updateData({ ...job.data, afterContactId }),
    );
  }
}
