import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sendingSources } from "./integrations";

export const warmupMailboxes = pgTable(
  "warmup_mailboxes",
  {
    sourceId: uuid("source_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    pausedReason: text("paused_reason"),
    domain: text("domain").notNull(),
    identifier: text("identifier").notNull(),
    startedOn: date("started_on", { mode: "string" }),
    holdDays: integer("hold_days").default(0).notNull(),
    startPerDay: smallint("start_per_day").default(5).notNull(),
    incrementPerDay: smallint("increment_per_day").default(2).notNull(),
    maxPerDay: smallint("max_per_day").default(30).notNull(),
    randomize: boolean("randomize").default(true).notNull(),
    replyRate: smallint("reply_rate").default(30).notNull(),
    weekdaysOnly: boolean("weekdays_only").default(false).notNull(),
    plannedOn: date("planned_on", { mode: "string" }),
    plannedCount: smallint("planned_count").default(0).notNull(),
    folderId: text("folder_id"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "warmup_mailboxes_source_fk",
      columns: [table.workspaceId, table.sourceId],
      foreignColumns: [sendingSources.workspaceId, sendingSources.id],
    }).onDelete("cascade"),
    index("warmup_mailboxes_workspace_id_idx").on(table.workspaceId),
    index("warmup_mailboxes_pool_idx")
      .on(table.domain)
      .where(sql`${table.enabled} and ${table.pausedReason} is null`),
    check(
      "warmup_mailboxes_volume_check",
      sql`${table.startPerDay} between 1 and 50 and ${table.incrementPerDay} between 1 and 5 and ${table.maxPerDay} between 1 and 50 and ${table.startPerDay} <= ${table.maxPerDay}`,
    ),
    check(
      "warmup_mailboxes_reply_rate_check",
      sql`${table.replyRate} between 0 and 60`,
    ),
    check(
      "warmup_mailboxes_paused_reason_check",
      sql`${table.pausedReason} is null or ${table.pausedReason} in ('manual', 'source_unavailable', 'sign_in_failed', 'bounces')`,
    ),
  ],
);

export const warmupMessages = pgTable(
  "warmup_messages",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    threadId: uuid("thread_id").notNull(),
    kind: text("kind").notNull(),
    senderSourceId: uuid("sender_source_id").notNull(),
    senderWorkspaceId: uuid("sender_workspace_id").notNull(),
    recipientSourceId: uuid("recipient_source_id").notNull(),
    recipientWorkspaceId: uuid("recipient_workspace_id").notNull(),
    rfcMessageId: text("rfc_message_id").notNull(),
    inReplyTo: text("in_reply_to"),
    subject: text("subject").notNull(),
    status: text("status").default("scheduled").notNull(),
    replyPlanned: boolean("reply_planned").default(false).notNull(),
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    landedIn: text("landed_in"),
    rescued: boolean("rescued").default(false).notNull(),
    errorCode: text("error_code"),
  },
  (table) => [
    foreignKey({
      name: "warmup_messages_sender_fk",
      columns: [table.senderWorkspaceId, table.senderSourceId],
      foreignColumns: [sendingSources.workspaceId, sendingSources.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "warmup_messages_recipient_fk",
      columns: [table.recipientWorkspaceId, table.recipientSourceId],
      foreignColumns: [sendingSources.workspaceId, sendingSources.id],
    }).onDelete("cascade"),
    index("warmup_messages_sender_source_id_created_at_idx").on(
      table.senderSourceId,
      table.createdAt.desc(),
    ),
    index("warmup_messages_recipient_pending_idx")
      .on(table.recipientSourceId, table.sentAt)
      .where(sql`${table.status} = 'sent'`),
    index("warmup_messages_due_idx")
      .on(table.sendAt)
      .where(sql`${table.status} = 'scheduled'`),
    index("warmup_messages_created_at_idx").on(table.createdAt),
    check(
      "warmup_messages_kind_check",
      sql`${table.kind} in ('opener', 'reply')`,
    ),
    check(
      "warmup_messages_status_check",
      sql`${table.status} in ('scheduled', 'sent', 'received', 'missing', 'failed')`,
    ),
    check(
      "warmup_messages_landed_in_check",
      sql`${table.landedIn} is null or ${table.landedIn} in ('inbox', 'spam')`,
    ),
  ],
);
