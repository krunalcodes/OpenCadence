import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { workspaces } from "./auth";

export const inboxThreads = pgTable(
  "inbox_threads",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull(),
    contactId: uuid("contact_id"),
    contactEmail: text("contact_email").notNull(),
    contactName: text("contact_name"),
    subject: text("subject").default("").notNull(),
    snippet: text("snippet").default("").notNull(),
    status: text("status").default("open").notNull(),
    unread: boolean("unread").default(true).notNull(),
    rootMessageId: uuid("root_message_id"),
    rootRfcMessageId: text("root_rfc_message_id"),
    campaignId: uuid("campaign_id"),
    sequenceId: uuid("sequence_id"),
    enrollmentId: uuid("enrollment_id"),
    messageCount: integer("message_count").default(0).notNull(),
    lastDirection: text("last_direction").default("inbound").notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("inbox_threads_workspace_id_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("inbox_threads_root_uidx")
      .on(table.workspaceId, table.sourceId, table.rootRfcMessageId)
      .where(sql`${table.rootRfcMessageId} is not null`),
    index("inbox_threads_workspace_id_status_last_message_at_id_idx").on(
      table.workspaceId,
      table.status,
      table.lastMessageAt.desc(),
      table.id.desc(),
    ),
    index("inbox_threads_workspace_id_last_message_at_id_idx").on(
      table.workspaceId,
      table.lastMessageAt.desc(),
      table.id.desc(),
    ),
    index("inbox_threads_workspace_id_unread_idx")
      .on(table.workspaceId, table.lastMessageAt.desc())
      .where(sql`${table.unread} and ${table.status} = 'open'`),
    index("inbox_threads_workspace_id_contact_email_idx").on(
      table.workspaceId,
      table.contactEmail,
    ),
    check(
      "inbox_threads_status_check",
      sql`${table.status} in ('open', 'closed')`,
    ),
    check(
      "inbox_threads_last_direction_check",
      sql`${table.lastDirection} in ('inbound', 'outbound')`,
    ),
  ],
);

export const inboxMessages = pgTable(
  "inbox_messages",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    threadId: uuid("thread_id").notNull(),
    direction: text("direction").notNull(),
    rfcMessageId: text("rfc_message_id"),
    inReplyTo: text("in_reply_to"),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: text("to_emails").array().default(sql`'{}'::text[]`).notNull(),
    subject: text("subject").default("").notNull(),
    text: text("text"),
    html: text("html"),
    outboundMessageId: uuid("outbound_message_id"),
    sentByUserId: uuid("sent_by_user_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "inbox_messages_thread_fk",
      columns: [table.workspaceId, table.threadId],
      foreignColumns: [inboxThreads.workspaceId, inboxThreads.id],
    }).onDelete("cascade"),
    uniqueIndex("inbox_messages_workspace_id_rfc_message_id_uidx")
      .on(table.workspaceId, table.rfcMessageId)
      .where(sql`${table.rfcMessageId} is not null`),
    index("inbox_messages_thread_id_occurred_at_idx").on(
      table.threadId,
      table.occurredAt,
    ),
    index("inbox_messages_created_at_idx").on(table.createdAt),
    check(
      "inbox_messages_direction_check",
      sql`${table.direction} in ('inbound', 'outbound')`,
    ),
  ],
);
