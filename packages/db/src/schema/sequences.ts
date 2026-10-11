import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth";
import { contacts } from "./contacts";

const counter = (name: string) => integer(name).default(0).notNull();

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

export const sequences = pgTable(
  "sequences",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").default("draft").notNull(),
    sourceIds: uuid("source_ids").array().default(sql`'{}'::uuid[]`).notNull(),
    fromName: text("from_name"),
    trackOpens: boolean("track_opens").default(false).notNull(),
    trackClicks: boolean("track_clicks").default(false).notNull(),
    stopOnReply: boolean("stop_on_reply").default(true).notNull(),
    timezone: text("timezone").default("UTC").notNull(),
    sendDays: smallint("send_days")
      .array()
      .default(sql`'{1,2,3,4,5}'::smallint[]`)
      .notNull(),
    windowStartMinute: smallint("window_start_minute").default(540).notNull(),
    windowEndMinute: smallint("window_end_minute").default(1020).notNull(),
    dailyLimitPerSource: integer("daily_limit_per_source"),
    layout: jsonb("layout").$type<Record<string, { x: number; y: number }>>(),
    enrolledCount: counter("enrolled_count"),
    activeCount: counter("active_count"),
    completedCount: counter("completed_count"),
    repliedCount: counter("replied_count"),
    bouncedCount: counter("bounced_count"),
    unsubscribedCount: counter("unsubscribed_count"),
    sentCount: counter("sent_count"),
    openedCount: counter("opened_count"),
    clickedCount: counter("clicked_count"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("sequences_workspace_id_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("sequences_workspace_id_name_uidx").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    index("sequences_workspace_id_created_at_id_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check(
      "sequences_status_check",
      sql`${table.status} in ('draft', 'active', 'paused', 'archived')`,
    ),
    check(
      "sequences_name_check",
      sql`char_length(${table.name}) between 1 and 120`,
    ),
    check(
      "sequences_window_check",
      sql`${table.windowStartMinute} between 0 and 1439 and ${table.windowEndMinute} between 1 and 1440 and ${table.windowStartMinute} < ${table.windowEndMinute}`,
    ),
    check(
      "sequences_send_days_check",
      sql`cardinality(${table.sendDays}) between 1 and 7 and ${table.sendDays} <@ '{1,2,3,4,5,6,7}'::smallint[]`,
    ),
  ],
);

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    sequenceId: uuid("sequence_id").notNull(),
    position: integer("position").notNull(),
    type: text("type").default("email").notNull(),
    delayMinutes: integer("delay_minutes").default(0).notNull(),
    templateId: uuid("template_id"),
    subject: text("subject").default("").notNull(),
    threadMode: text("thread_mode").default("reply").notNull(),
    snapshotId: uuid("snapshot_id"),
    sentCount: counter("sent_count"),
    openedCount: counter("opened_count"),
    clickedCount: counter("clicked_count"),
    repliedCount: counter("replied_count"),
    bouncedCount: counter("bounced_count"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "sequence_steps_sequence_fk",
      columns: [table.workspaceId, table.sequenceId],
      foreignColumns: [sequences.workspaceId, sequences.id],
    }).onDelete("cascade"),
    uniqueIndex("sequence_steps_sequence_id_position_uidx").on(
      table.sequenceId,
      table.position,
    ),
    check("sequence_steps_type_check", sql`${table.type} in ('email')`),
    check(
      "sequence_steps_thread_mode_check",
      sql`${table.threadMode} in ('reply', 'new')`,
    ),
    check(
      "sequence_steps_delay_minutes_check",
      sql`${table.delayMinutes} between 0 and 525600`,
    ),
    check("sequence_steps_position_check", sql`${table.position} >= 0`),
  ],
);

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    sequenceId: uuid("sequence_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    status: text("status").default("active").notNull(),
    sourceId: uuid("source_id"),
    nextStepPosition: integer("next_step_position").default(0).notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    threadRootRfcId: text("thread_root_rfc_id"),
    threadSubject: text("thread_subject"),
    lastMessageId: uuid("last_message_id"),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    finishReason: text("finish_reason"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    enrolledByUserId: uuid("enrolled_by_user_id"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "sequence_enrollments_sequence_fk",
      columns: [table.workspaceId, table.sequenceId],
      foreignColumns: [sequences.workspaceId, sequences.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "sequence_enrollments_contact_fk",
      columns: [table.workspaceId, table.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }).onDelete("cascade"),
    uniqueIndex("sequence_enrollments_sequence_id_contact_id_uidx").on(
      table.sequenceId,
      table.contactId,
    ),
    index("sequence_enrollments_due_idx")
      .on(table.nextRunAt)
      .where(sql`${table.status} = 'active'`),
    index("sequence_enrollments_sequence_id_status_enrolled_at_id_idx").on(
      table.sequenceId,
      table.status,
      table.enrolledAt.desc(),
      table.id.desc(),
    ),
    index("sequence_enrollments_sequence_id_enrolled_at_id_idx").on(
      table.sequenceId,
      table.enrolledAt.desc(),
      table.id.desc(),
    ),
    index("sequence_enrollments_contact_id_idx").on(table.contactId),
    check(
      "sequence_enrollments_status_check",
      sql`${table.status} in ('active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed', 'failed', 'removed')`,
    ),
  ],
);

export const sequenceReplyCursors = pgTable("sequence_reply_cursors", {
  sourceId: uuid("source_id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  state: jsonb("state").$type<Record<string, string | number>>(),
  updatedAt: updatedAt(),
});
