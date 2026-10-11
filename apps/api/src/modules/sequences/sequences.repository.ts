import { Inject, Injectable } from "@nestjs/common";
import { and, asc, type Db, eq, inArray, schema, sql } from "@workspace/db";
import { databaseError, uniqueViolation } from "../../common/database-error";
import {
  type KeysetCursor,
  keysetTimestampFormat,
} from "../../common/pagination/keyset-cursor";
import { DATABASE } from "../../infra/database/database.module";
import type { EnrollmentStatus, SequenceStatus } from "./sequences.constants";

const { contacts, sequenceEnrollments, sequenceSteps, sequences } = schema;

type Executor = Pick<Db, "insert" | "update" | "delete" | "select" | "execute">;

export type SequenceRow = typeof sequences.$inferSelect;
export type StepRow = typeof sequenceSteps.$inferSelect;
export type EnrollmentRow = typeof sequenceEnrollments.$inferSelect;

export type SequenceListRow = SequenceRow & {
  stepCount: number;
  cursorAt: string;
};

export type SequenceSettings = {
  name: string;
  sourceIds: string[];
  fromName: string | null;
  fromEmail: string | null;
  trackOpens: boolean;
  trackClicks: boolean;
  stopOnReply: boolean;
  timezone: string;
  sendDays: number[];
  windowStartMinute: number;
  windowEndMinute: number;
  dailyLimitPerSource: number | null;
  layout: Record<string, { x: number; y: number }> | null;
};

export type StepValues = {
  id?: string;
  delayMinutes: number;
  templateId: string | null;
  subject: string;
  threadMode: "reply" | "new";
  snapshotId: string | null;
};

export type SequenceWriteResult =
  | { ok: true; row: SequenceRow }
  | { ok: false; reason: "name_taken" | "not_found" };

export type EnrollmentListRow = EnrollmentRow & {
  contactEmail: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  cursorAt: string;
};

export type ClaimedEnrollment = EnrollmentRow & { dueAt: Date };

export type EnrollmentChange = {
  from: EnrollmentStatus[];
  to: EnrollmentStatus;
  finishReason: string | null;
  finishedAt: Date | null;
  schedule: "keep" | "clear" | { fallback: Date };
};

export type CounterName = "sent" | "opened" | "clicked" | "replied" | "bounced";

export type OutcomeChange = {
  sequenceId: string;
  stepId: string | null;
  enrollmentId: string | null;
  step: CounterName[];
  sequence: ("sent" | "opened" | "clicked")[];
  end: Omit<EnrollmentChange, "schedule"> | null;
};

const positionShift = 1000;

function likePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function textArray(values: string[]) {
  return sql`${`{${values.join(",")}}`}::text[]`;
}

function uuidArray(values: string[]) {
  return sql`${`{${values.join(",")}}`}::uuid[]`;
}

function timestamp(value: Date) {
  return sql`${value.toISOString()}::timestamptz`;
}

@Injectable()
export class SequencesRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  listSequences(
    workspaceId: string,
    query: {
      status?: SequenceStatus;
      search?: string;
      cursor?: KeysetCursor;
      limit: number;
    },
  ): Promise<SequenceListRow[]> {
    const pattern = query.search ? `%${likePattern(query.search)}%` : null;
    return this.db
      .select({
        sequence: sequences,
        stepCount: sql<number>`(select count(*)::int from "sequence_steps" where "sequence_steps"."sequence_id" = "sequences"."id")`,
        cursorAt: sql<string>`to_char(${sequences.createdAt} at time zone 'UTC', ${keysetTimestampFormat})`,
      })
      .from(sequences)
      .where(
        and(
          eq(sequences.workspaceId, workspaceId),
          query.status ? eq(sequences.status, query.status) : undefined,
          pattern ? sql`${sequences.name} ilike ${pattern}` : undefined,
          query.cursor
            ? sql`(${sequences.createdAt}, ${sequences.id}) < (${query.cursor.at}::timestamptz, ${query.cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        sql`${sequences.createdAt} desc nulls last`,
        sql`${sequences.id} desc nulls last`,
      )
      .limit(query.limit)
      .then((rows) =>
        rows.map((row) => ({
          ...row.sequence,
          stepCount: row.stepCount,
          cursorAt: row.cursorAt,
        })),
      );
  }

  async findSequence(
    workspaceId: string,
    id: string,
  ): Promise<SequenceRow | null> {
    const [row] = await this.db
      .select()
      .from(sequences)
      .where(and(eq(sequences.workspaceId, workspaceId), eq(sequences.id, id)));
    return row ?? null;
  }

  findSequencesById(ids: string[]): Promise<SequenceRow[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.db.select().from(sequences).where(inArray(sequences.id, ids));
  }

  listSteps(workspaceId: string, sequenceId: string): Promise<StepRow[]> {
    return this.db
      .select()
      .from(sequenceSteps)
      .where(
        and(
          eq(sequenceSteps.workspaceId, workspaceId),
          eq(sequenceSteps.sequenceId, sequenceId),
        ),
      )
      .orderBy(asc(sequenceSteps.position));
  }

  listStepsOf(sequenceIds: string[]): Promise<StepRow[]> {
    if (sequenceIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.db
      .select()
      .from(sequenceSteps)
      .where(inArray(sequenceSteps.sequenceId, sequenceIds))
      .orderBy(asc(sequenceSteps.sequenceId), asc(sequenceSteps.position));
  }

  async namesStartingWith(workspaceId: string, prefix: string) {
    const rows = await this.db
      .select({ name: sequences.name })
      .from(sequences)
      .where(
        and(
          eq(sequences.workspaceId, workspaceId),
          sql`lower(${sequences.name}) like ${`${likePattern(prefix.toLowerCase())}%`}`,
        ),
      );
    return rows.map((row) => row.name);
  }

  async insertSequence(
    workspaceId: string,
    values: Partial<SequenceSettings> & { name: string },
    userId: string | null,
    steps: StepValues[] = [],
  ): Promise<SequenceWriteResult> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(sequences)
          .values({ workspaceId, ...values, createdByUserId: userId })
          .returning();
        if (!row) {
          return { ok: false, reason: "not_found" } as const;
        }
        if (steps.length > 0) {
          await tx.insert(sequenceSteps).values(
            steps.map((step, position) => ({
              workspaceId,
              sequenceId: row.id,
              position,
              delayMinutes: step.delayMinutes,
              templateId: step.templateId,
              subject: step.subject,
              threadMode: step.threadMode,
              snapshotId: step.snapshotId,
            })),
          );
        }
        return { ok: true, row } as const;
      });
    } catch (error) {
      if (databaseError(error)?.code === uniqueViolation) {
        return { ok: false, reason: "name_taken" };
      }
      throw error;
    }
  }

  async updateSequence(
    workspaceId: string,
    id: string,
    values: Partial<SequenceSettings>,
  ): Promise<SequenceWriteResult> {
    try {
      const [row] = await this.db
        .update(sequences)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(eq(sequences.workspaceId, workspaceId), eq(sequences.id, id)),
        )
        .returning();
      return row ? { ok: true, row } : { ok: false, reason: "not_found" };
    } catch (error) {
      if (databaseError(error)?.code === uniqueViolation) {
        return { ok: false, reason: "name_taken" };
      }
      throw error;
    }
  }

  async setStatus(
    workspaceId: string,
    id: string,
    to: SequenceStatus,
    from: SequenceStatus[],
  ): Promise<SequenceRow | null> {
    const [row] = await this.db
      .update(sequences)
      .set({ status: to })
      .where(
        and(
          eq(sequences.workspaceId, workspaceId),
          eq(sequences.id, id),
          inArray(sequences.status, from),
        ),
      )
      .returning();
    return row ?? null;
  }

  async deleteSequence(workspaceId: string, id: string) {
    const rows = await this.db
      .delete(sequences)
      .where(
        and(
          eq(sequences.workspaceId, workspaceId),
          eq(sequences.id, id),
          sql`${sequences.status} <> 'active'`,
        ),
      )
      .returning({ id: sequences.id });
    return rows.length > 0;
  }

  replaceSteps(
    workspaceId: string,
    sequenceId: string,
    steps: StepValues[],
  ): Promise<StepRow[] | null> {
    return this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: sequences.id })
        .from(sequences)
        .where(
          and(
            eq(sequences.workspaceId, workspaceId),
            eq(sequences.id, sequenceId),
          ),
        )
        .for("update");
      if (!locked) {
        return null;
      }
      const scope = and(
        eq(sequenceSteps.workspaceId, workspaceId),
        eq(sequenceSteps.sequenceId, sequenceId),
      );
      const kept = steps.flatMap((step) => (step.id ? [step.id] : []));
      await tx
        .delete(sequenceSteps)
        .where(
          and(
            scope,
            kept.length > 0
              ? sql`${sequenceSteps.id} <> all(${uuidArray(kept)})`
              : undefined,
          ),
        );
      await tx
        .update(sequenceSteps)
        .set({ position: sql`${sequenceSteps.position} + ${positionShift}` })
        .where(scope);
      for (const [position, step] of steps.entries()) {
        const values = {
          position,
          delayMinutes: step.delayMinutes,
          templateId: step.templateId,
          subject: step.subject,
          threadMode: step.threadMode,
          snapshotId: step.snapshotId,
        };
        if (step.id) {
          await tx
            .update(sequenceSteps)
            .set(values)
            .where(and(scope, eq(sequenceSteps.id, step.id)));
        } else {
          await tx
            .insert(sequenceSteps)
            .values({ workspaceId, sequenceId, ...values });
        }
      }
      await tx
        .update(sequences)
        .set({ updatedAt: new Date() })
        .where(eq(sequences.id, sequenceId));
      return tx
        .select()
        .from(sequenceSteps)
        .where(scope)
        .orderBy(asc(sequenceSteps.position));
    });
  }

  async setStepSnapshot(
    workspaceId: string,
    stepId: string,
    snapshotId: string | null,
  ) {
    await this.db
      .update(sequenceSteps)
      .set({ snapshotId })
      .where(
        and(
          eq(sequenceSteps.workspaceId, workspaceId),
          eq(sequenceSteps.id, stepId),
        ),
      );
  }

  findContactEmails(workspaceId: string, ids: string[]) {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.db
      .select({ id: contacts.id, email: contacts.email })
      .from(contacts)
      .where(
        and(eq(contacts.workspaceId, workspaceId), inArray(contacts.id, ids)),
      );
  }

  async insertEnrollments(input: {
    workspaceId: string;
    sequenceId: string;
    contactIds: string[];
    nextRunAt: Date;
    userId: string | null;
  }): Promise<number> {
    if (input.contactIds.length === 0) {
      return 0;
    }
    const result = await this.db.execute<{ inserted: number }>(sql`
      with picked as (
        select c.id from ${contacts} as c
        where c.workspace_id = ${input.workspaceId}::uuid
          and c.id = any(${uuidArray(input.contactIds)})
      ), inserted as (
        insert into ${sequenceEnrollments}
          (workspace_id, sequence_id, contact_id, status, next_run_at, enrolled_by_user_id)
        select
          ${input.workspaceId}::uuid,
          ${input.sequenceId}::uuid,
          picked.id,
          'active',
          ${timestamp(input.nextRunAt)},
          ${input.userId}::uuid
        from picked
        on conflict (sequence_id, contact_id) do nothing
        returning 1
      ), counted as (
        update ${sequences} as s
        set enrolled_count = s.enrolled_count + (select count(*) from inserted),
            active_count = s.active_count + (select count(*) from inserted)
        where s.workspace_id = ${input.workspaceId}::uuid
          and s.id = ${input.sequenceId}::uuid
          and exists (select 1 from inserted)
        returning 1
      )
      select (select count(*)::int from inserted) as "inserted"
    `);
    return result.rows[0]?.inserted ?? 0;
  }

  listEnrollments(
    workspaceId: string,
    sequenceId: string,
    query: {
      status?: EnrollmentStatus;
      search?: string;
      cursor?: KeysetCursor;
      limit: number;
    },
  ): Promise<EnrollmentListRow[]> {
    const pattern = query.search
      ? `%${likePattern(query.search.toLowerCase())}%`
      : null;
    return this.db
      .select({
        enrollment: sequenceEnrollments,
        contactEmail: contacts.email,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        cursorAt: sql<string>`to_char(${sequenceEnrollments.enrolledAt} at time zone 'UTC', ${keysetTimestampFormat})`,
      })
      .from(sequenceEnrollments)
      .innerJoin(
        contacts,
        and(
          eq(contacts.workspaceId, sequenceEnrollments.workspaceId),
          eq(contacts.id, sequenceEnrollments.contactId),
        ),
      )
      .where(
        and(
          eq(sequenceEnrollments.workspaceId, workspaceId),
          eq(sequenceEnrollments.sequenceId, sequenceId),
          query.status
            ? eq(sequenceEnrollments.status, query.status)
            : undefined,
          pattern ? sql`${contacts.searchText} like ${pattern}` : undefined,
          query.cursor
            ? sql`(${sequenceEnrollments.enrolledAt}, ${sequenceEnrollments.id}) < (${query.cursor.at}::timestamptz, ${query.cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        sql`${sequenceEnrollments.enrolledAt} desc nulls last`,
        sql`${sequenceEnrollments.id} desc nulls last`,
      )
      .limit(query.limit)
      .then((rows) =>
        rows.map((row) => ({
          ...row.enrollment,
          contactEmail: row.contactEmail,
          contactFirstName: row.contactFirstName,
          contactLastName: row.contactLastName,
          cursorAt: row.cursorAt,
        })),
      );
  }

  async findEnrollment(
    workspaceId: string,
    sequenceId: string,
    id: string,
  ): Promise<EnrollmentListRow | null> {
    const [row] = await this.db
      .select({
        enrollment: sequenceEnrollments,
        contactEmail: contacts.email,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(sequenceEnrollments)
      .innerJoin(
        contacts,
        and(
          eq(contacts.workspaceId, sequenceEnrollments.workspaceId),
          eq(contacts.id, sequenceEnrollments.contactId),
        ),
      )
      .where(
        and(
          eq(sequenceEnrollments.workspaceId, workspaceId),
          eq(sequenceEnrollments.sequenceId, sequenceId),
          eq(sequenceEnrollments.id, id),
        ),
      );
    return row
      ? {
          ...row.enrollment,
          contactEmail: row.contactEmail,
          contactFirstName: row.contactFirstName,
          contactLastName: row.contactLastName,
          cursorAt: "",
        }
      : null;
  }

  async findEnrollmentById(
    workspaceId: string,
    id: string,
  ): Promise<EnrollmentRow | null> {
    const [row] = await this.db
      .select()
      .from(sequenceEnrollments)
      .where(
        and(
          eq(sequenceEnrollments.workspaceId, workspaceId),
          eq(sequenceEnrollments.id, id),
        ),
      );
    return row ?? null;
  }

  async transition(
    workspaceId: string,
    enrollmentId: string,
    change: EnrollmentChange,
    executor: Executor = this.db,
  ): Promise<EnrollmentStatus | null> {
    const nextRunAt =
      change.schedule === "keep"
        ? sql`e.next_run_at`
        : change.schedule === "clear"
          ? sql`null`
          : sql`coalesce(e.next_run_at, ${timestamp(change.schedule.fallback)})`;
    const delta = (status: EnrollmentStatus) =>
      sql`${change.to === status ? 1 : 0} - (moved.previous = ${status})::int`;
    const result = await executor.execute<{ previous: EnrollmentStatus }>(sql`
      with target as (
        select t.id, t.sequence_id, t.status
        from ${sequenceEnrollments} as t
        where t.workspace_id = ${workspaceId}::uuid
          and t.id = ${enrollmentId}::uuid
          and t.status = any(${textArray(change.from)})
        for update
      ), moved as (
        update ${sequenceEnrollments} as e
        set status = ${change.to},
            next_run_at = ${nextRunAt},
            finish_reason = ${change.finishReason},
            finished_at = ${change.finishedAt ? timestamp(change.finishedAt) : sql`null`},
            updated_at = now()
        from target
        where e.id = target.id
        returning target.sequence_id as sequence_id, target.status as previous
      ), counted as (
        update ${sequences} as s
        set active_count = s.active_count + ${delta("active")},
            completed_count = s.completed_count + ${delta("completed")},
            replied_count = s.replied_count + ${delta("replied")},
            bounced_count = s.bounced_count + ${delta("bounced")},
            unsubscribed_count = s.unsubscribed_count + ${delta("unsubscribed")}
        from moved
        where s.id = moved.sequence_id
        returning 1
      )
      select previous as "previous" from moved
    `);
    return result.rows[0]?.previous ?? null;
  }

  claimDue(input: {
    now: Date;
    lease: Date;
    limit: number;
    workspaceIds?: string[];
    excludeSourceIds: string[];
    excludeUnassignedSequenceIds: string[];
  }): Promise<ClaimedEnrollment[]> {
    const e = sequenceEnrollments;
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select({ id: e.id, dueAt: e.nextRunAt })
        .from(e)
        .where(
          and(
            eq(e.status, "active"),
            sql`${e.nextRunAt} <= ${timestamp(input.now)}`,
            sql`exists (
              select 1 from ${sequences}
              where ${sequences.id} = ${e.sequenceId}
                and ${sequences.status} = 'active'
            )`,
            input.workspaceIds
              ? sql`${e.workspaceId} = any(${uuidArray(input.workspaceIds)})`
              : undefined,
            input.excludeSourceIds.length > 0
              ? sql`(${e.sourceId} is null or ${e.sourceId} <> all(${uuidArray(input.excludeSourceIds)}))`
              : undefined,
            input.excludeUnassignedSequenceIds.length > 0
              ? sql`(${e.sourceId} is not null or ${e.sequenceId} <> all(${uuidArray(input.excludeUnassignedSequenceIds)}))`
              : undefined,
          ),
        )
        .orderBy(asc(e.nextRunAt))
        .limit(input.limit)
        .for("update", { skipLocked: true });
      if (due.length === 0) {
        return [];
      }
      const dueAt = new Map(due.map((row) => [row.id, row.dueAt]));
      const rows = await tx
        .update(e)
        .set({ nextRunAt: input.lease })
        .where(
          inArray(
            e.id,
            due.map((row) => row.id),
          ),
        )
        .returning();
      return rows
        .map((row) => ({ ...row, dueAt: dueAt.get(row.id) ?? input.now }))
        .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime());
    });
  }

  async release(held: { id: string; dueAt: Date }[], lease: Date) {
    if (held.length === 0) {
      return;
    }
    const ids = held.map((item) => item.id);
    const dueAts = held.map((item) => item.dueAt.toISOString());
    await this.db.execute(sql`
      update ${sequenceEnrollments} as e
      set next_run_at = held.due_at
      from unnest(${uuidArray(ids)}, ${`{${dueAts.join(",")}}`}::timestamptz[])
        as held(id, due_at)
      where e.id = held.id
        and e.status = 'active'
        and e.next_run_at = ${timestamp(lease)}
    `);
  }

  async reschedule(id: string, runAt: Date, lease: Date) {
    const rows = await this.db
      .update(sequenceEnrollments)
      .set({ nextRunAt: runAt })
      .where(
        and(
          eq(sequenceEnrollments.id, id),
          eq(sequenceEnrollments.status, "active"),
          sql`${sequenceEnrollments.nextRunAt} = ${timestamp(lease)}`,
        ),
      )
      .returning({ id: sequenceEnrollments.id });
    return rows.length > 0;
  }

  async assignSource(id: string, sourceId: string): Promise<string | null> {
    await this.db
      .update(sequenceEnrollments)
      .set({ sourceId })
      .where(
        and(
          eq(sequenceEnrollments.id, id),
          sql`${sequenceEnrollments.sourceId} is null`,
        ),
      );
    const [row] = await this.db
      .select({ sourceId: sequenceEnrollments.sourceId })
      .from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.id, id));
    return row?.sourceId ?? null;
  }

  advance(input: {
    workspaceId: string;
    enrollmentId: string;
    position: number;
    messageId: string;
    sentAt: Date;
    thread: { rootRfcId: string; subject: string } | null;
    next: { runAt: Date } | null;
  }): Promise<boolean> {
    const e = sequenceEnrollments;
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(e)
        .set({
          nextStepPosition: input.position + 1,
          nextRunAt: input.next ? input.next.runAt : null,
          lastMessageId: input.messageId,
          lastSentAt: input.sentAt,
          ...(input.thread
            ? {
                threadRootRfcId: input.thread.rootRfcId,
                threadSubject: input.thread.subject,
              }
            : {}),
        })
        .where(
          and(
            eq(e.workspaceId, input.workspaceId),
            eq(e.id, input.enrollmentId),
            eq(e.status, "active"),
            eq(e.nextStepPosition, input.position),
          ),
        )
        .returning({ id: e.id });
      if (rows.length === 0) {
        return false;
      }
      if (!input.next) {
        await this.transition(
          input.workspaceId,
          input.enrollmentId,
          {
            from: ["active"],
            to: "completed",
            finishReason: "completed",
            finishedAt: input.sentAt,
            schedule: "clear",
          },
          tx,
        );
      }
      return true;
    });
  }

  applyOutcome(
    workspaceId: string,
    change: OutcomeChange,
  ): Promise<EnrollmentStatus | null> {
    return this.db.transaction(async (tx) => {
      if (change.stepId && change.step.length > 0) {
        await tx
          .update(sequenceSteps)
          .set({
            ...(change.step.includes("sent")
              ? { sentCount: sql`${sequenceSteps.sentCount} + 1` }
              : {}),
            ...(change.step.includes("opened")
              ? { openedCount: sql`${sequenceSteps.openedCount} + 1` }
              : {}),
            ...(change.step.includes("clicked")
              ? { clickedCount: sql`${sequenceSteps.clickedCount} + 1` }
              : {}),
            ...(change.step.includes("replied")
              ? { repliedCount: sql`${sequenceSteps.repliedCount} + 1` }
              : {}),
            ...(change.step.includes("bounced")
              ? { bouncedCount: sql`${sequenceSteps.bouncedCount} + 1` }
              : {}),
          })
          .where(
            and(
              eq(sequenceSteps.workspaceId, workspaceId),
              eq(sequenceSteps.id, change.stepId),
            ),
          );
      }
      if (change.sequence.length > 0) {
        await tx
          .update(sequences)
          .set({
            ...(change.sequence.includes("sent")
              ? { sentCount: sql`${sequences.sentCount} + 1` }
              : {}),
            ...(change.sequence.includes("opened")
              ? { openedCount: sql`${sequences.openedCount} + 1` }
              : {}),
            ...(change.sequence.includes("clicked")
              ? { clickedCount: sql`${sequences.clickedCount} + 1` }
              : {}),
          })
          .where(
            and(
              eq(sequences.workspaceId, workspaceId),
              eq(sequences.id, change.sequenceId),
            ),
          );
      }
      if (!change.end || !change.enrollmentId) {
        return null;
      }
      return this.transition(
        workspaceId,
        change.enrollmentId,
        { ...change.end, schedule: "clear" },
        tx,
      );
    });
  }

  listReconcilable(input: { workspaceIds?: string[]; activeSince: Date }) {
    return this.db
      .select({ id: sequences.id, workspaceId: sequences.workspaceId })
      .from(sequences)
      .where(
        and(
          sql`${sequences.enrolledCount} > 0`,
          sql`(${sequences.status} in ('active', 'paused') or ${sequences.updatedAt} > ${timestamp(input.activeSince)})`,
          input.workspaceIds
            ? sql`${sequences.workspaceId} = any(${uuidArray(input.workspaceIds)})`
            : undefined,
        ),
      );
  }
}
