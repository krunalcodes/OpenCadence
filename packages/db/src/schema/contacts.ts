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
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    company: text("company"),
    jobTitle: text("job_title"),
    phone: text("phone"),
    city: text("city"),
    country: text("country"),
    timezone: text("timezone"),
    fields: jsonb("fields")
      .$type<Record<string, string | number | boolean | null>>()
      .default({})
      .notNull(),
    origin: text("origin").default("manual").notNull(),
    searchText: text("search_text").generatedAlwaysAs(
      sql`lower(email || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(company, ''))`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("contacts_workspace_id_email_uidx").on(
      table.workspaceId,
      table.email.op("text_pattern_ops"),
    ),
    uniqueIndex("contacts_workspace_id_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
    index("contacts_workspace_id_created_at_id_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("contacts_fields_idx").using(
      "gin",
      sql`${table.fields} jsonb_path_ops`,
    ),
    index("contacts_search_text_idx").using(
      "gin",
      sql`${table.searchText} gin_trgm_ops`,
    ),
    check(
      "contacts_email_check",
      sql`${table.email} = lower(${table.email}) and char_length(${table.email}) between 3 and 320`,
    ),
    check(
      "contacts_origin_check",
      sql`${table.origin} in ('manual', 'import', 'api', 'form')`,
    ),
  ],
);

export const contactFields = pgTable(
  "contact_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    options: jsonb("options").$type<string[]>(),
    position: integer("position").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("contact_fields_workspace_id_key_uidx").on(
      table.workspaceId,
      table.key,
    ),
    check(
      "contact_fields_key_check",
      sql`${table.key} ~ '^[a-z][a-z0-9_]{0,39}$'`,
    ),
    check(
      "contact_fields_type_check",
      sql`${table.type} in ('text', 'number', 'date', 'boolean', 'select')`,
    ),
    check(
      "contact_fields_label_check",
      sql`char_length(${table.label}) between 1 and 80`,
    ),
  ],
);

export const lists = pgTable(
  "lists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isPublic: boolean("is_public").default(false).notNull(),
    publicName: text("public_name"),
    publicDescription: text("public_description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("lists_workspace_id_name_uidx").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    uniqueIndex("lists_workspace_id_id_uidx").on(table.workspaceId, table.id),
    check("lists_name_check", sql`char_length(${table.name}) between 1 and 80`),
  ],
);

export const listMembers = pgTable(
  "list_members",
  {
    listId: uuid("list_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    status: text("status").default("subscribed").notNull(),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      name: "list_members_pk",
      columns: [table.listId, table.contactId],
    }),
    foreignKey({
      name: "list_members_list_fk",
      columns: [table.workspaceId, table.listId],
      foreignColumns: [lists.workspaceId, lists.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "list_members_contact_fk",
      columns: [table.workspaceId, table.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }).onDelete("cascade"),
    index("list_members_contact_id_idx").on(table.contactId),
    index("list_members_list_id_status_idx").on(table.listId, table.status),
    check(
      "list_members_status_check",
      sql`${table.status} in ('subscribed', 'unsubscribed')`,
    ),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("tags_workspace_id_name_uidx").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    uniqueIndex("tags_workspace_id_id_uidx").on(table.workspaceId, table.id),
    check("tags_name_check", sql`char_length(${table.name}) between 1 and 50`),
  ],
);

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: uuid("contact_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      name: "contact_tags_pk",
      columns: [table.contactId, table.tagId],
    }),
    foreignKey({
      name: "contact_tags_contact_fk",
      columns: [table.workspaceId, table.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "contact_tags_tag_fk",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tags.workspaceId, tags.id],
    }).onDelete("cascade"),
    index("contact_tags_tag_id_contact_id_idx").on(
      table.tagId,
      table.contactId,
    ),
  ],
);

export const segments = pgTable(
  "segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("segments_workspace_id_name_uidx").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    index("segments_created_by_user_id_idx")
      .on(table.createdByUserId)
      .where(sql`${table.createdByUserId} is not null`),
    check(
      "segments_name_check",
      sql`char_length(${table.name}) between 1 and 80`,
    ),
  ],
);

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status").default("uploaded").notNull(),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    columns: jsonb("columns").$type<string[]>().default([]).notNull(),
    sampleRows: jsonb("sample_rows").$type<string[][]>().default([]).notNull(),
    mapping: jsonb("mapping").$type<Record<string, string>>(),
    options: jsonb("options").$type<Record<string, unknown>>(),
    totalRows: integer("total_rows").default(0).notNull(),
    processedRows: integer("processed_rows").default(0).notNull(),
    createdCount: integer("created_count").default(0).notNull(),
    updatedCount: integer("updated_count").default(0).notNull(),
    skippedCount: integer("skipped_count").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),
    errorReportKey: text("error_report_key"),
    errorMessage: text("error_message"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("imports_workspace_id_created_at_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
    ),
    index("imports_created_by_user_id_idx")
      .on(table.createdByUserId)
      .where(sql`${table.createdByUserId} is not null`),
    check(
      "imports_status_check",
      sql`${table.status} in ('uploaded', 'queued', 'running', 'completed', 'failed', 'cancelled')`,
    ),
  ],
);
