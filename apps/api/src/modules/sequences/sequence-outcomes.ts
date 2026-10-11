import { Inject, Injectable } from "@nestjs/common";
import { isUuid } from "../../common/uuid";
import type { MessageOutcomeJob } from "../dispatch/dispatch.constants";
import {
  type EnrollmentStatus,
  endableEnrollmentStatuses,
} from "./sequences.constants";
import {
  type OutcomeChange,
  SequencesRepository,
} from "./sequences.repository";

export type OutcomeResult = {
  counted: boolean;
  ended: EnrollmentStatus | null;
};

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

@Injectable()
export class SequenceOutcomes {
  constructor(
    @Inject(SequencesRepository)
    private readonly repository: SequencesRepository,
  ) {}

  async apply(job: MessageOutcomeJob): Promise<OutcomeResult> {
    const nothing = { counted: false, ended: null };
    if (!job.sequenceId || !isUuid(job.sequenceId)) {
      return nothing;
    }
    const change: OutcomeChange = {
      sequenceId: job.sequenceId,
      stepId: job.sequenceStepId,
      enrollmentId: job.enrollmentId,
      step: [],
      sequence: [],
      end: null,
    };
    const end = (to: EnrollmentStatus, finishReason: string) => {
      change.end = {
        from: endableEnrollmentStatuses,
        to,
        finishReason,
        finishedAt: validDate(job.occurredAt),
      };
    };

    if (
      job.type === "sent" ||
      job.type === "opened" ||
      job.type === "clicked"
    ) {
      if (job.first) {
        change.step.push(job.type);
        change.sequence.push(job.type);
      }
    } else if (job.type === "replied") {
      if (job.first) {
        change.step.push("replied");
      }
      const sequence = await this.repository.findSequence(
        job.workspaceId,
        job.sequenceId,
      );
      if (sequence?.stopOnReply) {
        end("replied", "replied");
      }
    } else if (job.type === "bounced" || job.type === "complained") {
      if (job.first) {
        change.step.push("bounced");
      }
      end("bounced", job.type);
    } else if (job.type === "unsubscribed") {
      end("unsubscribed", "unsubscribed");
    } else if (job.type === "failed") {
      end("failed", "send_failed");
    } else {
      return nothing;
    }

    if (
      change.step.length === 0 &&
      change.sequence.length === 0 &&
      !change.end
    ) {
      return nothing;
    }
    const previous = await this.repository.applyOutcome(
      job.workspaceId,
      change,
    );
    return {
      counted: change.step.length > 0 || change.sequence.length > 0,
      ended: previous && change.end ? change.end.to : null,
    };
  }
}
