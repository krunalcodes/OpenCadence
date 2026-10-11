import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { contactMergeValues, renderMergeTags } from "@workspace/email-renderer";
import { REDIS, type Redis } from "../../infra/redis/redis.module";
import { BrandService } from "../brand/brand.service";
import { ContactsService } from "../contacts/contacts.service";
import { DispatchService, type MessageDto } from "../dispatch/dispatch.service";
import {
  type SendingSourceDto,
  SendingSourcesService,
} from "../integrations/sending-sources.service";
import {
  type SuppressionReason,
  SuppressionService,
} from "../suppression/suppression.service";
import {
  isInsideWindow,
  nextWindowDay,
  nextWindowOpening,
  type SendWindow,
  startOfLocalDay,
  windowLengthMs,
} from "./send-window";
import {
  claimBatchSize,
  claimLeaseMs,
  type EnrollmentStatus,
  endableEnrollmentStatuses,
  maxClaimBatches,
  maxOpeningJitterMs,
  maxReconcilePages,
  minuteMs,
  reconcilePageSize,
  replySourceRecencyMs,
  retryAfterErrorMs,
  retryUnusableSourceMs,
  SEQUENCE_CLOCK,
  type SequenceClock,
  type SequenceScope,
  sourceSpacingMs,
} from "./sequences.constants";
import {
  type ClaimedEnrollment,
  type SequenceRow,
  SequencesRepository,
  type StepRow,
} from "./sequences.repository";

export type TickResult = {
  claimed: number;
  sent: number;
  held: number;
  rescheduled: number;
  completed: number;
  ended: number;
  failed: number;
};

type Brand = { name: string; address: string | null; website: string | null };

type TickContext = {
  now: Date;
  lease: Date;
  usedSources: Set<string>;
  fullSequences: Set<string>;
  held: { id: string; dueAt: Date }[];
  sequences: Map<string, { row: SequenceRow; steps: StepRow[] }>;
  sources: Map<string, Map<string, SendingSourceDto>>;
  brands: Map<string, Brand>;
  sentToday: Map<string, number>;
  subjects: Map<string, string>;
  result: TickResult;
};

const spacingKeyPrefix = "opencadence:sequence-spacing";
const maxSubjectLength = 998;
const countedStatuses = [
  "queued",
  "sent",
  "delivered",
  "delayed",
  "bounced",
  "complained",
] as const;

const spacingScript = `
local last = tonumber(redis.call('GET', KEYS[1]) or '')
local now = tonumber(ARGV[1])
if last and now >= last and now - last < tonumber(ARGV[2]) then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
return 1
`;

export function spacingKey(sourceId: string) {
  return `${spacingKeyPrefix}:${sourceId}`;
}

export function stepIdempotencyKey(enrollmentId: string, stepId: string) {
  return `seq:${enrollmentId}:${stepId}`;
}

export function replySubject(threadSubject: string) {
  return /^re:/i.test(threadSubject.trim())
    ? threadSubject.trim()
    : `Re: ${threadSubject.trim()}`;
}

export function endingFor(reason: SuppressionReason | undefined): {
  to: EnrollmentStatus;
  finishReason: string;
} {
  if (reason === "bounced" || reason === "complained") {
    return { to: "bounced", finishReason: `suppressed_${reason}` };
  }
  return {
    to: "unsubscribed",
    finishReason: `suppressed_${reason ?? "unsubscribed"}`,
  };
}

function windowOf(row: SequenceRow): SendWindow {
  return {
    timezone: row.timezone,
    sendDays: row.sendDays,
    startMinute: row.windowStartMinute,
    endMinute: row.windowEndMinute,
  };
}

function isUsable(source: SendingSourceDto | undefined) {
  return Boolean(source && source.status === "active" && source.email);
}

function errorCode(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const code =
      typeof response === "object" && response !== null
        ? (response as { code?: unknown }).code
        : undefined;
    return typeof code === "string" ? code : `http_${error.getStatus()}`;
  }
  return error instanceof Error ? error.name : "unknown";
}

@Injectable()
export class SequenceRunner {
  private readonly logger = new Logger(SequenceRunner.name);

  constructor(
    @Inject(SequencesRepository)
    private readonly repository: SequencesRepository,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(BrandService) private readonly brands: BrandService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SEQUENCE_CLOCK) private readonly clock: SequenceClock,
  ) {}

  async tick(
    now = this.clock.now(),
    scope: SequenceScope = {},
  ): Promise<TickResult> {
    const context: TickContext = {
      now,
      lease: new Date(now.getTime() + claimLeaseMs),
      usedSources: new Set(),
      fullSequences: new Set(),
      held: [],
      sequences: new Map(),
      sources: new Map(),
      brands: new Map(),
      sentToday: new Map(),
      subjects: new Map(),
      result: {
        claimed: 0,
        sent: 0,
        held: 0,
        rescheduled: 0,
        completed: 0,
        ended: 0,
        failed: 0,
      },
    };
    try {
      for (let batch = 0; batch < maxClaimBatches; batch += 1) {
        const claimed = await this.repository.claimDue({
          now,
          lease: context.lease,
          limit: claimBatchSize,
          workspaceIds: scope.workspaceIds,
          excludeSourceIds: [...context.usedSources],
          excludeUnassignedSequenceIds: [...context.fullSequences],
        });
        context.result.claimed += claimed.length;
        await this.loadSequences(context, claimed);
        for (const enrollment of claimed) {
          try {
            await this.run(context, enrollment);
          } catch (error) {
            context.result.failed += 1;
            this.logger.warn(
              `Enrolment ${enrollment.id} could not take its next step: ${errorCode(error)}`,
            );
            await this.repository
              .reschedule(
                enrollment.id,
                new Date(now.getTime() + retryAfterErrorMs),
                context.lease,
              )
              .catch(() => undefined);
          }
        }
        if (claimed.length < claimBatchSize) {
          break;
        }
      }
    } finally {
      context.result.held = context.held.length;
      await this.repository.release(context.held, context.lease);
    }
    return context.result;
  }

  async reconcile(now = this.clock.now(), scope: SequenceScope = {}) {
    const sequences = await this.repository.listReconcilable({
      workspaceIds: scope.workspaceIds,
      activeSince: new Date(now.getTime() - replySourceRecencyMs),
    });
    let ended = 0;
    for (const sequence of sequences) {
      let cursor: string | undefined;
      for (let page = 0; page < maxReconcilePages; page += 1) {
        const { emails, nextCursor } = await this.dispatch.list(
          sequence.workspaceId,
          {
            sequenceId: sequence.id,
            status: "skipped",
            limit: reconcilePageSize,
            cursor,
          },
        );
        let changed = 0;
        for (const message of emails) {
          if (
            message.enrollmentId &&
            (await this.endSuppressed(
              sequence.workspaceId,
              message.enrollmentId,
              message,
              now,
              endableEnrollmentStatuses,
            ))
          ) {
            changed += 1;
          }
        }
        ended += changed;
        if (!nextCursor || changed === 0) {
          break;
        }
        cursor = nextCursor;
      }
    }
    return { ended };
  }

  private async loadSequences(
    context: TickContext,
    claimed: ClaimedEnrollment[],
  ) {
    const missing = [
      ...new Set(claimed.map((enrollment) => enrollment.sequenceId)),
    ].filter((id) => !context.sequences.has(id));
    const [rows, steps] = await Promise.all([
      this.repository.findSequencesById(missing),
      this.repository.listStepsOf(missing),
    ]);
    for (const row of rows) {
      context.sequences.set(row.id, {
        row,
        steps: steps.filter((step) => step.sequenceId === row.id),
      });
    }
  }

  private async run(context: TickContext, enrollment: ClaimedEnrollment) {
    const { now, lease, result } = context;
    const sequence = context.sequences.get(enrollment.sequenceId);
    if (sequence?.row.status !== "active") {
      context.held.push(enrollment);
      return;
    }
    const { row, steps } = sequence;
    const { workspaceId } = enrollment;
    const step = steps[enrollment.nextStepPosition];
    if (!step) {
      await this.repository.transition(workspaceId, enrollment.id, {
        from: ["active"],
        to: "completed",
        finishReason: "completed",
        finishedAt: now,
        schedule: "clear",
      });
      result.completed += 1;
      return;
    }
    const window = windowOf(row);
    const later = async (runAt: Date) => {
      await this.repository.reschedule(enrollment.id, runAt, lease);
      result.rescheduled += 1;
    };
    if (!isInsideWindow(window, now)) {
      await later(this.withJitter(nextWindowOpening(window, now), window));
      return;
    }
    if (!step.snapshotId) {
      await later(new Date(now.getTime() + retryUnusableSourceMs));
      return;
    }

    const sources = await this.workspaceSources(context, workspaceId);
    let sourceId = enrollment.sourceId;
    if (!sourceId) {
      const usable = row.sourceIds.filter((id) => isUsable(sources.get(id)));
      if (usable.length === 0) {
        await later(new Date(now.getTime() + retryUnusableSourceMs));
        return;
      }
      const counts = new Map<string, number>();
      for (const id of usable) {
        counts.set(id, await this.sentToday(context, row, id));
      }
      const underLimit = usable.filter(
        (id) =>
          row.dailyLimitPerSource === null ||
          (counts.get(id) ?? 0) < row.dailyLimitPerSource,
      );
      if (underLimit.length === 0) {
        await later(this.withJitter(nextWindowDay(window, now), window));
        return;
      }
      const free = underLimit.filter((id) => !context.usedSources.has(id));
      const [chosen] = free.sort(
        (left, right) => (counts.get(left) ?? 0) - (counts.get(right) ?? 0),
      );
      if (!chosen) {
        context.fullSequences.add(row.id);
        context.held.push(enrollment);
        return;
      }
      sourceId = await this.repository.assignSource(enrollment.id, chosen);
      if (!sourceId) {
        return;
      }
    }

    const source = sources.get(sourceId);
    if (!source || !isUsable(source)) {
      await later(new Date(now.getTime() + retryUnusableSourceMs));
      return;
    }
    if (
      row.dailyLimitPerSource !== null &&
      (await this.sentToday(context, row, sourceId)) >= row.dailyLimitPerSource
    ) {
      await later(this.withJitter(nextWindowDay(window, now), window));
      return;
    }
    if (
      context.usedSources.has(sourceId) ||
      !(await this.takeSlot(sourceId, now))
    ) {
      context.usedSources.add(sourceId);
      context.held.push(enrollment);
      return;
    }
    context.usedSources.add(sourceId);

    const { message, created, startsThread } = await this.handOff(
      context,
      row,
      step,
      enrollment,
      source,
    );
    if (created) {
      const key = `${row.id}:${sourceId}`;
      context.sentToday.set(key, (context.sentToday.get(key) ?? 0) + 1);
    }
    if (message.status === "skipped") {
      await this.endSuppressed(workspaceId, enrollment.id, message, now, [
        "active",
      ]);
      result.ended += 1;
      return;
    }
    const next = steps[enrollment.nextStepPosition + 1];
    const advanced = await this.repository.advance({
      workspaceId,
      enrollmentId: enrollment.id,
      position: enrollment.nextStepPosition,
      messageId: message.id,
      sentAt: now,
      thread:
        startsThread && message.rfcMessageId
          ? { rootRfcId: message.rfcMessageId, subject: message.subject }
          : null,
      next: next
        ? { runAt: new Date(now.getTime() + next.delayMinutes * minuteMs) }
        : null,
    });
    if (created) {
      result.sent += 1;
    }
    if (advanced && !next) {
      result.completed += 1;
    }
  }

  private async handOff(
    context: TickContext,
    sequence: SequenceRow,
    step: StepRow,
    enrollment: ClaimedEnrollment,
    source: SendingSourceDto,
  ): Promise<{ message: MessageDto; created: boolean; startsThread: boolean }> {
    const { workspaceId } = enrollment;
    const inThread =
      step.threadMode === "reply" &&
      Boolean(enrollment.threadRootRfcId) &&
      enrollment.threadSubject !== null;
    const startsThread = !inThread;
    const existing = await this.findStepMessage(
      workspaceId,
      enrollment.id,
      step.id,
    );
    if (existing) {
      return { message: existing, created: false, startsThread };
    }

    const contact = await this.contacts.get(workspaceId, enrollment.contactId);
    const brand = await this.brand(context, workspaceId);
    const variables = contactMergeValues({ contact, brand });
    const subject = inThread
      ? replySubject(enrollment.threadSubject ?? "")
      : renderMergeTags(
          await this.subjectOf(context, workspaceId, step),
          variables,
        )
          .replace(/\s+/g, " ")
          .trim();
    try {
      const message = await this.dispatch.enqueue({
        workspaceId,
        kind: "sequence",
        sourceId: source.id,
        from: {
          email: source.email ?? "",
          name: sequence.fromName ?? (brand.name.trim() || null),
        },
        to: [contact.email],
        subject: subject.slice(0, maxSubjectLength),
        content: { snapshotId: step.snapshotId ?? "", variables },
        contactId: contact.id,
        sequence: {
          sequenceId: sequence.id,
          stepId: step.id,
          enrollmentId: enrollment.id,
        },
        tracking: {
          opens: sequence.trackOpens,
          clicks: sequence.trackClicks,
        },
        unsubscribe: {},
        headers:
          inThread && enrollment.threadRootRfcId
            ? {
                "In-Reply-To": enrollment.threadRootRfcId,
                References: enrollment.threadRootRfcId,
              }
            : undefined,
        idempotencyKey: stepIdempotencyKey(enrollment.id, step.id),
      });
      return { message, created: true, startsThread };
    } catch (error) {
      if (errorCode(error) === "idempotency_conflict") {
        const earlier = await this.findStepMessage(
          workspaceId,
          enrollment.id,
          step.id,
        );
        if (earlier) {
          return { message: earlier, created: false, startsThread };
        }
      }
      throw error;
    }
  }

  private async findStepMessage(
    workspaceId: string,
    enrollmentId: string,
    stepId: string,
  ) {
    let cursor: string | undefined;
    for (let page = 0; page < maxReconcilePages; page += 1) {
      const { emails, nextCursor } = await this.dispatch.list(workspaceId, {
        enrollmentId,
        limit: reconcilePageSize,
        cursor,
      });
      const found = emails.find((message) => message.sequenceStepId === stepId);
      if (found || !nextCursor) {
        return found ?? null;
      }
      cursor = nextCursor;
    }
    return null;
  }

  private async endSuppressed(
    workspaceId: string,
    enrollmentId: string,
    message: MessageDto,
    now: Date,
    from: EnrollmentStatus[],
  ) {
    const email = message.suppressed[0] ?? message.to[0] ?? "";
    const blocked = email
      ? await this.suppression.findBlocked(workspaceId, [email], "sequence")
      : new Map<string, SuppressionReason>();
    const ending = endingFor(blocked.get(email));
    const previous = await this.repository.transition(
      workspaceId,
      enrollmentId,
      {
        from,
        to: ending.to,
        finishReason: ending.finishReason,
        finishedAt: now,
        schedule: "clear",
      },
    );
    return previous !== null;
  }

  private withJitter(opening: Date, window: SendWindow) {
    const spread = Math.min(maxOpeningJitterMs, windowLengthMs(window));
    return new Date(
      opening.getTime() + Math.floor(this.clock.random() * spread),
    );
  }

  private async takeSlot(sourceId: string, now: Date) {
    const taken = await this.redis.eval(
      spacingScript,
      1,
      spacingKey(sourceId),
      String(now.getTime()),
      String(sourceSpacingMs),
      String(sourceSpacingMs * 4),
    );
    return Number(taken) === 1;
  }

  private async workspaceSources(context: TickContext, workspaceId: string) {
    let found = context.sources.get(workspaceId);
    if (!found) {
      const { sources } = await this.sources.list(workspaceId);
      found = new Map(sources.map((source) => [source.id, source]));
      context.sources.set(workspaceId, found);
    }
    return found;
  }

  private async brand(context: TickContext, workspaceId: string) {
    let found = context.brands.get(workspaceId);
    if (!found) {
      const brand = await this.brands.get(workspaceId);
      found = {
        name: brand.brandName,
        address: brand.postalAddress,
        website: brand.websiteUrl,
      };
      context.brands.set(workspaceId, found);
    }
    return found;
  }

  private async subjectOf(
    context: TickContext,
    workspaceId: string,
    step: StepRow,
  ) {
    if (step.subject) {
      return step.subject;
    }
    const key = step.snapshotId ?? "";
    let subject = context.subjects.get(key);
    if (subject === undefined) {
      subject =
        (await this.dispatch.getSnapshot(workspaceId, key))?.subject ?? "";
      context.subjects.set(key, subject);
    }
    return subject;
  }

  private async sentToday(
    context: TickContext,
    sequence: SequenceRow,
    sourceId: string,
  ) {
    const key = `${sequence.id}:${sourceId}`;
    let count = context.sentToday.get(key);
    if (count === undefined) {
      const counts = await this.dispatch.countByStatus(sequence.workspaceId, {
        sequenceId: sequence.id,
        sourceId,
        since: startOfLocalDay(sequence.timezone, context.now),
      });
      count = countedStatuses.reduce(
        (total, status) => total + counts[status],
        0,
      );
      context.sentToday.set(key, count);
    }
    return count;
  }
}
