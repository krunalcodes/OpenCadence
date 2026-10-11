import { InjectQueue } from "@nestjs/bullmq";
import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { apiError } from "../../common/api-error";
import {
  clampLimit,
  decodeKeysetCursor,
  encodeKeysetCursor,
} from "../../common/pagination/keyset-cursor";
import { isUuid } from "../../common/uuid";
import { DispatchService } from "../dispatch/dispatch.service";
import { SendingSourcesService } from "../integrations/sending-sources.service";
import { AudienceService } from "../segments/audience.service";
import { SuppressionService } from "../suppression/suppression.service";
import { parseContactIds, record, validation } from "./sequence-input";
import {
  type EnrollJob,
  type EnrollmentStatus,
  enrollmentStatuses,
  enrollPageSize,
  minuteMs,
  openEnrollmentStatuses,
  SEQUENCE_CLOCK,
  SEQUENCE_ENROLL_QUEUE,
  type SequenceClock,
  sequenceJobs,
} from "./sequences.constants";
import {
  type EnrollmentChange,
  type EnrollmentListRow,
  SequencesRepository,
} from "./sequences.repository";

export type EnrollmentDto = {
  id: string;
  contact: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  status: EnrollmentStatus;
  source: { id: string; name: string } | null;
  nextStepPosition: number;
  nextRunAt: string | null;
  lastSentAt: string | null;
  finishReason: string | null;
  enrolledAt: string;
  finishedAt: string | null;
};

export type EnrollmentMessage = {
  id: string;
  stepId: string | null;
  subject: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
};

export type EnrollResult = {
  enrolled: number;
  alreadyEnrolled: number;
  suppressed: number;
  queued: boolean;
};

export type EnrollmentsQuery = {
  status?: string;
  search?: string;
  cursor?: string;
  limit?: number;
};

const defaultLimit = 50;
const maxLimit = 100;
const maxSearchLength = 200;
const enrollJobOptions = {
  attempts: 8,
  backoff: { type: "exponential" as const, delay: 5000 },
};

function sequenceNotFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This sequence was not found. It may have been deleted.",
  );
}

function enrollmentNotFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This contact is not enrolled in the sequence.",
  );
}

@Injectable()
export class EnrollmentsService {
  constructor(
    @Inject(SequencesRepository)
    private readonly repository: SequencesRepository,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
    @Inject(AudienceService) private readonly audience: AudienceService,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(SEQUENCE_CLOCK) private readonly clock: SequenceClock,
    @InjectQueue(SEQUENCE_ENROLL_QUEUE)
    private readonly queue: Queue<EnrollJob>,
  ) {}

  async list(workspaceId: string, sequenceId: string, query: EnrollmentsQuery) {
    await this.requireSequence(workspaceId, sequenceId);
    if (
      query.status &&
      !enrollmentStatuses.includes(query.status as EnrollmentStatus)
    ) {
      throw validation(
        `status must be one of: ${enrollmentStatuses.join(", ")}.`,
        "status",
      );
    }
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : undefined;
    if (cursor === null) {
      throw validation(
        "The cursor is not valid. Start again from the first page.",
        "cursor",
      );
    }
    const limit = clampLimit(query.limit, defaultLimit, maxLimit);
    const rows = await this.repository.listEnrollments(
      workspaceId,
      sequenceId,
      {
        status: query.status as EnrollmentStatus | undefined,
        search: query.search?.trim().slice(0, maxSearchLength) || undefined,
        cursor,
        limit: limit + 1,
      },
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const names = await this.sourceNames(workspaceId, page);
    return {
      items: page.map((row) => this.toDto(row, names)),
      nextCursor:
        rows.length > limit && last
          ? encodeKeysetCursor({ at: last.cursorAt, id: last.id })
          : null,
    };
  }

  async get(workspaceId: string, sequenceId: string, id: string) {
    const row = await this.require(workspaceId, sequenceId, id);
    const [names, { emails }] = await Promise.all([
      this.sourceNames(workspaceId, [row]),
      this.dispatch.list(workspaceId, { enrollmentId: id, limit: maxLimit }),
    ]);
    return {
      ...this.toDto(row, names),
      messages: emails
        .map(
          (message): EnrollmentMessage => ({
            id: message.id,
            stepId: message.sequenceStepId,
            subject: message.subject,
            status: message.status,
            sentAt: message.sentAt,
            openedAt: message.openedAt,
            clickedAt: message.clickedAt,
            repliedAt: message.repliedAt,
          }),
        )
        .reverse(),
    };
  }

  async enroll(
    workspaceId: string,
    sequenceId: string,
    input: unknown,
    userId: string | null,
  ): Promise<EnrollResult> {
    const sequence = await this.requireSequence(workspaceId, sequenceId);
    if (sequence.status === "archived") {
      throw apiError(
        HttpStatus.CONFLICT,
        "sequence_archived",
        "This sequence is archived. Activate it again to enrol contacts.",
      );
    }
    const body = record(input);
    if (body.audience !== undefined && body.contactIds !== undefined) {
      throw validation("Send contactIds or an audience, not both.", "audience");
    }
    if (body.audience !== undefined) {
      const audience = await this.audience.validate(workspaceId, body.audience);
      await this.queue.add(
        sequenceJobs.enroll,
        { workspaceId, sequenceId, audience, afterContactId: null, userId },
        enrollJobOptions,
      );
      return { enrolled: 0, alreadyEnrolled: 0, suppressed: 0, queued: true };
    }
    const contactIds = parseContactIds(body.contactIds);
    const found = await this.repository.findContactEmails(
      workspaceId,
      contactIds,
    );
    const blocked = await this.suppression.findBlocked(
      workspaceId,
      found.map((contact) => contact.email),
      "sequence",
    );
    const eligible = found.filter((contact) => !blocked.has(contact.email));
    const enrolled = await this.repository.insertEnrollments({
      workspaceId,
      sequenceId,
      contactIds: eligible.map((contact) => contact.id),
      nextRunAt: await this.firstRunAt(workspaceId, sequenceId),
      userId,
    });
    return {
      enrolled,
      alreadyEnrolled: eligible.length - enrolled,
      suppressed: found.length - eligible.length,
      queued: false,
    };
  }

  async enrollAudience(
    job: EnrollJob,
    saveCursor: (afterContactId: string) => Promise<void>,
  ) {
    const { workspaceId, sequenceId } = job;
    let after = job.afterContactId;
    let enrolled = 0;
    let pages = 0;
    for (;;) {
      const sequence = await this.repository.findSequence(
        workspaceId,
        sequenceId,
      );
      if (!sequence || sequence.status === "archived") {
        return { enrolled, pages, stopped: true };
      }
      let page: Awaited<ReturnType<AudienceService["page"]>>;
      try {
        page = await this.audience.page(
          workspaceId,
          job.audience,
          after,
          enrollPageSize,
        );
      } catch (error) {
        if (
          error instanceof HttpException &&
          error.getStatus() === HttpStatus.NOT_FOUND
        ) {
          return { enrolled, pages, stopped: true };
        }
        throw error;
      }
      const last = page.at(-1);
      if (last) {
        enrolled += await this.repository.insertEnrollments({
          workspaceId,
          sequenceId,
          contactIds: page.map((contact) => contact.id),
          nextRunAt: await this.firstRunAt(workspaceId, sequenceId),
          userId: job.userId,
        });
        pages += 1;
        after = last.id;
        await saveCursor(after);
      }
      if (page.length < enrollPageSize) {
        return { enrolled, pages, stopped: false };
      }
    }
  }

  pause(workspaceId: string, sequenceId: string, id: string) {
    return this.change(workspaceId, sequenceId, id, {
      from: ["active"],
      to: "paused",
      finishReason: null,
      finishedAt: null,
      schedule: "keep",
    });
  }

  resume(workspaceId: string, sequenceId: string, id: string) {
    return this.change(workspaceId, sequenceId, id, {
      from: ["paused"],
      to: "active",
      finishReason: null,
      finishedAt: null,
      schedule: { fallback: this.clock.now() },
    });
  }

  remove(workspaceId: string, sequenceId: string, id: string) {
    return this.change(workspaceId, sequenceId, id, {
      from: openEnrollmentStatuses,
      to: "removed",
      finishReason: "removed",
      finishedAt: this.clock.now(),
      schedule: "clear",
    });
  }

  private async change(
    workspaceId: string,
    sequenceId: string,
    id: string,
    change: EnrollmentChange,
  ) {
    const current = await this.require(workspaceId, sequenceId, id);
    if (current.status !== change.to) {
      const previous = await this.repository.transition(
        workspaceId,
        id,
        change,
      );
      if (!previous) {
        throw apiError(
          HttpStatus.CONFLICT,
          "invalid_state",
          `This enrolment is ${current.status}, so it cannot be changed to ${change.to}.`,
        );
      }
    }
    const row = await this.require(workspaceId, sequenceId, id);
    return this.toDto(row, await this.sourceNames(workspaceId, [row]));
  }

  private async firstRunAt(workspaceId: string, sequenceId: string) {
    const [first] = await this.repository.listSteps(workspaceId, sequenceId);
    return new Date(
      this.clock.now().getTime() + (first?.delayMinutes ?? 0) * minuteMs,
    );
  }

  private async requireSequence(workspaceId: string, sequenceId: string) {
    const row = isUuid(sequenceId)
      ? await this.repository.findSequence(workspaceId, sequenceId)
      : null;
    if (!row) {
      throw sequenceNotFound();
    }
    return row;
  }

  private async require(workspaceId: string, sequenceId: string, id: string) {
    const row =
      isUuid(sequenceId) && isUuid(id)
        ? await this.repository.findEnrollment(workspaceId, sequenceId, id)
        : null;
    if (!row) {
      throw enrollmentNotFound();
    }
    return row;
  }

  private async sourceNames(workspaceId: string, rows: EnrollmentListRow[]) {
    if (!rows.some((row) => row.sourceId)) {
      return new Map<string, string>();
    }
    const { sources } = await this.sources.list(workspaceId);
    return new Map(sources.map((source) => [source.id, source.name]));
  }

  private toDto(
    row: EnrollmentListRow,
    sourceNames: Map<string, string>,
  ): EnrollmentDto {
    const sourceName = row.sourceId ? sourceNames.get(row.sourceId) : undefined;
    return {
      id: row.id,
      contact: {
        id: row.contactId,
        email: row.contactEmail,
        firstName: row.contactFirstName,
        lastName: row.contactLastName,
      },
      status: row.status as EnrollmentStatus,
      source:
        row.sourceId && sourceName
          ? { id: row.sourceId, name: sourceName }
          : null,
      nextStepPosition: row.nextStepPosition,
      nextRunAt:
        row.status === "active" || row.status === "paused"
          ? (row.nextRunAt?.toISOString() ?? null)
          : null,
      lastSentAt: row.lastSentAt?.toISOString() ?? null,
      finishReason: row.finishReason,
      enrolledAt: row.enrolledAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }
}
