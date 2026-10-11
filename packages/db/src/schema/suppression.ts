import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth";

export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    origin: text("origin").notNull(),
    sourceId: uuid("source_id"),
    messageId: uuid("message_id"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("suppressions_workspace_id_email_reason_uidx").on(
      table.workspaceId,
      table.email.op("text_pattern_ops"),
      table.reason,
    ),
    index("suppressions_workspace_id_created_at_id_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("suppressions_workspace_id_reason_created_at_id_idx").on(
      table.workspaceId,
      table.reason,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("suppressions_created_by_user_id_idx")
      .on(table.createdByUserId)
      .where(sql`${table.createdByUserId} is not null`),
    check(
      "suppressions_reason_check",
      sql`${table.reason} in ('unsubscribed', 'bounced', 'complained', 'manual')`,
    ),
    check(
      "suppressions_origin_check",
      sql`${table.origin} in ('user', 'api', 'webhook', 'import')`,
    ),
    check(
      "suppressions_email_check",
      sql`${table.email} = lower(${table.email}) and char_length(${table.email}) between 3 and 320`,
    ),
  ],
);
