import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth";

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    subject: text("subject").default("").notNull(),
    previewText: text("preview_text").default("").notNull(),
    document: jsonb("document").$type<Record<string, unknown>>(),
    html: text("html").default("").notNull(),
    text: text("text").default("").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
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
    uniqueIndex("templates_workspace_id_name_uidx").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    uniqueIndex("templates_workspace_id_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
    index("templates_workspace_id_updated_at_id_idx").on(
      table.workspaceId,
      table.updatedAt.desc(),
      table.id.desc(),
    ),
    check(
      "templates_name_check",
      sql`char_length(${table.name}) between 1 and 120`,
    ),
    check("templates_subject_check", sql`char_length(${table.subject}) <= 998`),
    check(
      "templates_preview_text_check",
      sql`char_length(${table.previewText}) <= 300`,
    ),
  ],
);
