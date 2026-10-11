import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth";

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("media_assets_workspace_id_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
    index("media_assets_workspace_id_created_at_id_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check(
      "media_assets_content_type_check",
      sql`${table.contentType} in ('image/png', 'image/jpeg', 'image/gif', 'image/webp')`,
    ),
    check("media_assets_byte_size_check", sql`${table.byteSize} > 0`),
    check(
      "media_assets_file_name_check",
      sql`char_length(${table.fileName}) between 1 and 200`,
    ),
  ],
);
