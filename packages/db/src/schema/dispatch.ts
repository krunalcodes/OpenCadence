import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { workspaces } from "./auth";
import { sendingSources } from "./integrations";

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").default(sql`uuidv7()`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").default("queued").notNull(),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: text("to_emails").array().notNull(),
    ccEmails: text("cc_emails").array(),
    bccEmails: text("bcc_emails").array(),
    suppressedEmails: text("suppressed_emails").array(),
    replyTo: text("reply_to"),
    subject: text("subject").notNull(),
    tags: jsonb("tags").$type<Record<string, string>>(),
    rfcMessageId: text("rfc_message_id"),
    providerMessageId: text("provider_message_id"),
    attempts: smallint("attempts").default(0).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    contactId: uuid("contact_id"),
    campaignId: uuid("campaign_id"),
    sequenceId: uuid("sequence_id"),
    sequenceStepId: uuid("sequence_step_id"),
    enrollmentId: uuid("enrollment_id"),
    trackOpens: boolean("track_opens").default(false).notNull(),
    trackClicks: boolean("track_clicks").default(false).notNull(),
    unsubscribeListId: uuid("unsubscribe_list_id"),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    openCount: integer("open_count").default(0).notNull(),
    firstClickedAt: timestamp("first_clicked_at", { withTimezone: true }),
    clickCount: integer("click_count").default(0).notNull(),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: "messages_pk", columns: [table.id, table.createdAt] }),
    index("messages_campaign_id_created_at_id_idx")
      .on(table.campaignId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.campaignId} is not null`),
    index("messages_campaign_id_status_idx")
      .on(table.campaignId, table.status)
      .where(sql`${table.campaignId} is not null`),
    index("messages_enrollment_id_created_at_idx")
      .on(table.enrollmentId, table.createdAt.desc())
      .where(sql`${table.enrollmentId} is not null`),
    index("messages_sequence_id_created_at_id_idx")
      .on(table.sequenceId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.sequenceId} is not null`),
    index("messages_contact_id_created_at_idx")
      .on(table.workspaceId, table.contactId, table.createdAt.desc())
      .where(sql`${table.contactId} is not null`),
    foreignKey({
      name: "messages_source_fk",
      columns: [table.workspaceId, table.sourceId],
      foreignColumns: [sendingSources.workspaceId, sendingSources.id],
    }).onDelete("cascade"),
    index("messages_workspace_id_created_at_id_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("messages_workspace_id_status_created_at_id_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("messages_source_id_provider_message_id_idx")
      .on(table.sourceId, table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    check(
      "messages_kind_check",
      sql`${table.kind} in ('transactional', 'campaign', 'sequence', 'test')`,
    ),
    check(
      "messages_status_check",
      sql`${table.status} in ('queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'skipped')`,
    ),
    check(
      "messages_to_emails_check",
      sql`cardinality(${table.toEmails}) between 1 and 50`,
    ),
  ],
);

export const messageContents = pgTable(
  "message_contents",
  {
    messageId: uuid("message_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    html: text("html"),
    text: text("text"),
    headers: jsonb("headers").$type<Record<string, string>>(),
    snapshotId: uuid("snapshot_id"),
    variables: jsonb("variables").$type<Record<string, string>>(),
  },
  (table) => [
    primaryKey({
      name: "message_contents_pk",
      columns: [table.messageId, table.createdAt],
    }),
    index("message_contents_workspace_id_idx").on(table.workspaceId),
  ],
);

export const messageIdempotencyKeys = pgTable(
  "message_idempotency_keys",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    messageId: uuid("message_id").notNull(),
    messageCreatedAt: timestamp("message_created_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "message_idempotency_keys_pk",
      columns: [table.workspaceId, table.key],
    }),
    index("message_idempotency_keys_created_at_idx").on(table.createdAt),
    check(
      "message_idempotency_keys_key_check",
      sql`char_length(${table.key}) between 1 and 256`,
    ),
  ],
);

export const contentSnapshots = pgTable(
  "content_snapshots",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    previewText: text("preview_text").default("").notNull(),
    html: text("html").notNull(),
    text: text("text").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("content_snapshots_workspace_id_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
  ],
);

export const messageEvents = pgTable(
  "message_events",
  {
    id: uuid("id").default(sql`uuidv7()`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    messageId: uuid("message_id").notNull(),
    messageCreatedAt: timestamp("message_created_at", {
      withTimezone: true,
    }).notNull(),
    type: text("type").notNull(),
    url: text("url"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, string>>(),
  },
  (table) => [
    primaryKey({
      name: "message_events_pk",
      columns: [table.id, table.createdAt],
    }),
    index("message_events_message_id_created_at_idx").on(
      table.messageId,
      table.createdAt.desc(),
    ),
    index("message_events_workspace_id_created_at_id_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check(
      "message_events_type_check",
      sql`${table.type} in ('sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'opened', 'clicked', 'replied', 'unsubscribed')`,
    ),
  ],
);
