import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
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
import { users, workspaces } from "./auth";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

export const sendingSources = pgTable(
  "sending_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    integrationType: text("integration_type").notNull(),
    name: text("name").notNull(),
    status: text("status").default("active").notNull(),
    externalAccountId: text("external_account_id"),
    email: text("email"),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    dailySendLimit: integer("daily_send_limit"),
    isDefault: boolean("is_default").default(false).notNull(),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("sending_sources_workspace_id_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("sending_sources_workspace_id_name_uidx")
      .on(table.workspaceId, sql`lower(${table.name})`)
      .where(sql`${table.status} <> 'disconnected'`),
    uniqueIndex("sending_sources_workspace_id_type_external_account_id_uidx")
      .on(table.workspaceId, table.integrationType, table.externalAccountId)
      .where(
        sql`${table.externalAccountId} is not null and ${table.status} <> 'disconnected'`,
      ),
    uniqueIndex("sending_sources_workspace_id_default_uidx")
      .on(table.workspaceId)
      .where(sql`${table.isDefault} and ${table.status} <> 'disconnected'`),
    index("sending_sources_workspace_id_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("sending_sources_created_by_user_id_idx")
      .on(table.createdByUserId)
      .where(sql`${table.createdByUserId} is not null`),
    check(
      "sending_sources_status_check",
      sql`${table.status} in ('active', 'paused', 'needs_attention', 'disconnected')`,
    ),
    check(
      "sending_sources_integration_type_check",
      sql`${table.integrationType} ~ '^[a-z][a-z0-9-]{1,39}$'`,
    ),
    check(
      "sending_sources_name_check",
      sql`char_length(${table.name}) between 1 and 80`,
    ),
    check(
      "sending_sources_daily_send_limit_check",
      sql`${table.dailySendLimit} is null or ${table.dailySendLimit} >= 0`,
    ),
  ],
);

export const sendingSourceCredentials = pgTable(
  "sending_source_credentials",
  {
    sourceId: uuid("source_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    authType: text("auth_type").notNull(),
    keyVersion: integer("key_version").notNull(),
    wrappedDataKey: bytea("wrapped_data_key").notNull(),
    secretCiphertext: bytea("secret_ciphertext").notNull(),
    secretHint: text("secret_hint"),
    accessTokenCiphertext: bytea("access_token_ciphertext"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    scopes: text("scopes").array(),
    webhookExternalId: text("webhook_external_id"),
    webhookSecretCiphertext: bytea("webhook_secret_ciphertext"),
    secretRotatedAt: timestamp("secret_rotated_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "sending_source_credentials_source_fk",
      columns: [table.workspaceId, table.sourceId],
      foreignColumns: [sendingSources.workspaceId, sendingSources.id],
    }).onDelete("cascade"),
    index("sending_source_credentials_key_version_idx").on(table.keyVersion),
    index("sending_source_credentials_access_token_expires_at_idx")
      .on(table.accessTokenExpiresAt)
      .where(sql`${table.accessTokenExpiresAt} is not null`),
    check(
      "sending_source_credentials_auth_type_check",
      sql`${table.authType} in ('oauth2', 'api_key', 'password', 'access_key')`,
    ),
    check(
      "sending_source_credentials_secret_hint_check",
      sql`${table.secretHint} is null or char_length(${table.secretHint}) <= 4`,
    ),
  ],
);

export const sendingSourceDailyStats = pgTable(
  "sending_source_daily_stats",
  {
    sourceId: uuid("source_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    sentCount: integer("sent_count").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),
    warningCount: integer("warning_count").default(0).notNull(),
    health: text("health").default("healthy").notNull(),
    dailySendLimit: integer("daily_send_limit"),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      name: "sending_source_daily_stats_pk",
      columns: [table.sourceId, table.day],
    }),
    foreignKey({
      name: "sending_source_daily_stats_source_fk",
      columns: [table.workspaceId, table.sourceId],
      foreignColumns: [sendingSources.workspaceId, sendingSources.id],
    }).onDelete("cascade"),
    index("sending_source_daily_stats_workspace_id_day_idx").on(
      table.workspaceId,
      table.day,
    ),
    check(
      "sending_source_daily_stats_health_check",
      sql`${table.health} in ('healthy', 'warning', 'failing')`,
    ),
    check(
      "sending_source_daily_stats_counts_check",
      sql`${table.sentCount} >= 0 and ${table.errorCount} >= 0 and ${table.warningCount} >= 0`,
    ),
  ],
);

export const sendingSourceEvents = pgTable(
  "sending_source_events",
  {
    id: uuid("id").default(sql`uuidv7()`).notNull(),
    createdAt: createdAt(),
    workspaceId: uuid("workspace_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    severity: smallint("severity").notNull(),
    type: text("type").notNull(),
    code: text("code"),
    message: text("message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    actorUserId: uuid("actor_user_id"),
  },
  (table) => [
    primaryKey({
      name: "sending_source_events_pk",
      columns: [table.id, table.createdAt],
    }),
    foreignKey({
      name: "sending_source_events_source_fk",
      columns: [table.workspaceId, table.sourceId],
      foreignColumns: [sendingSources.workspaceId, sendingSources.id],
    }).onDelete("cascade"),
    index("sending_source_events_workspace_id_created_at_id_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("sending_source_events_workspace_id_source_id_created_at_id_idx").on(
      table.workspaceId,
      table.sourceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("sending_source_events_workspace_id_problems_idx")
      .on(table.workspaceId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.severity} >= 2`),
    check(
      "sending_source_events_severity_check",
      sql`${table.severity} between 1 and 3`,
    ),
  ],
);

export const sendingSourceWebhookReceipts = pgTable(
  "sending_source_webhook_receipts",
  {
    sourceId: uuid("source_id").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "sending_source_webhook_receipts_pk",
      columns: [table.sourceId, table.providerEventId],
    }),
    foreignKey({
      name: "sending_source_webhook_receipts_source_fk",
      columns: [table.workspaceId, table.sourceId],
      foreignColumns: [sendingSources.workspaceId, sendingSources.id],
    }).onDelete("cascade"),
    index("sending_source_webhook_receipts_received_at_idx").on(
      table.receivedAt,
    ),
  ],
);
