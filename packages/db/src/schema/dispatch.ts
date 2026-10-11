import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: "messages_pk", columns: [table.id, table.createdAt] }),
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
