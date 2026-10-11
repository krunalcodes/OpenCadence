import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth";

export type CampaignAudience =
  | { type: "all" }
  | { type: "lists"; listIds: string[] }
  | { type: "segment"; segmentId: string };

const counter = (name: string) => integer(name).default(0).notNull();

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").default("draft").notNull(),
    templateId: uuid("template_id"),
    subject: text("subject").default("").notNull(),
    previewText: text("preview_text").default("").notNull(),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    replyTo: text("reply_to"),
    sourceId: uuid("source_id"),
    audience: jsonb("audience").$type<CampaignAudience>(),
    trackOpens: boolean("track_opens").default(true).notNull(),
    trackClicks: boolean("track_clicks").default(true).notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    snapshotId: uuid("snapshot_id"),
    fanoutCursor: uuid("fanout_cursor"),
    fanoutDoneAt: timestamp("fanout_done_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    recipientCount: counter("recipient_count"),
    skippedCount: counter("skipped_count"),
    sentCount: counter("sent_count"),
    deliveredCount: counter("delivered_count"),
    bouncedCount: counter("bounced_count"),
    complainedCount: counter("complained_count"),
    failedCount: counter("failed_count"),
    openedCount: counter("opened_count"),
    clickedCount: counter("clicked_count"),
    unsubscribedCount: counter("unsubscribed_count"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("campaigns_workspace_id_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
    index("campaigns_workspace_id_created_at_id_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("campaigns_workspace_id_status_created_at_id_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("campaigns_scheduled_at_idx")
      .on(table.scheduledAt)
      .where(sql`${table.status} = 'scheduled'`),
    check(
      "campaigns_status_check",
      sql`${table.status} in ('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled', 'failed')`,
    ),
    check(
      "campaigns_name_check",
      sql`char_length(${table.name}) between 1 and 120`,
    ),
    check("campaigns_subject_check", sql`char_length(${table.subject}) <= 998`),
  ],
);
