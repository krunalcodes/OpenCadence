import { sql } from "drizzle-orm";
import {
  check,
  customType,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const workspaceAiSettings = pgTable(
  "workspace_ai_settings",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    baseUrl: text("base_url").notNull(),
    model: text("model").notNull(),
    keyVersion: integer("key_version").notNull(),
    wrappedDataKey: bytea("wrapped_data_key").notNull(),
    apiKeyCiphertext: bytea("api_key_ciphertext").notNull(),
    apiKeyHint: text("api_key_hint"),
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
    check(
      "workspace_ai_settings_base_url_check",
      sql`char_length(${table.baseUrl}) between 1 and 500`,
    ),
    check(
      "workspace_ai_settings_model_check",
      sql`char_length(${table.model}) between 1 and 200`,
    ),
    check(
      "workspace_ai_settings_api_key_hint_check",
      sql`${table.apiKeyHint} is null or char_length(${table.apiKeyHint}) <= 4`,
    ),
  ],
);
