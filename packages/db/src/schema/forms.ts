import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
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

export type FormField = {
  key: string;
  label: string;
  required: boolean;
};

export type FormSettings = {
  title?: string;
  description?: string;
  buttonLabel?: string;
  consentText?: string;
  successTitle?: string;
  successMessage?: string;
  redirectUrl?: string | null;
  confirmSubject?: string;
};

export const forms = pgTable(
  "forms",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    publicId: text("public_id").notNull(),
    name: text("name").notNull(),
    status: text("status").default("draft").notNull(),
    listIds: uuid("list_ids").array().default(sql`'{}'::uuid[]`).notNull(),
    doubleOptIn: boolean("double_opt_in").default(true).notNull(),
    fields: jsonb("fields").$type<FormField[]>().default([]).notNull(),
    settings: jsonb("settings").$type<FormSettings>().default({}).notNull(),
    sourceId: uuid("source_id"),
    submissionCount: integer("submission_count").default(0).notNull(),
    confirmedCount: integer("confirmed_count").default(0).notNull(),
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
    uniqueIndex("forms_public_id_uidx").on(table.publicId),
    uniqueIndex("forms_workspace_id_id_uidx").on(table.workspaceId, table.id),
    uniqueIndex("forms_workspace_id_name_uidx").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    check(
      "forms_status_check",
      sql`${table.status} in ('draft', 'published', 'archived')`,
    ),
    check(
      "forms_name_check",
      sql`char_length(${table.name}) between 1 and 120`,
    ),
    check(
      "forms_public_id_check",
      sql`${table.publicId} ~ '^[a-z0-9]{12,32}$'`,
    ),
  ],
);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    formId: uuid("form_id").notNull(),
    email: text("email").notNull(),
    data: jsonb("data").$type<Record<string, string>>().default({}).notNull(),
    status: text("status").default("pending").notNull(),
    contactId: uuid("contact_id"),
    consentText: text("consent_text"),
    userAgent: text("user_agent"),
    confirmationMessageId: uuid("confirmation_message_id"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "form_submissions_form_fk",
      columns: [table.workspaceId, table.formId],
      foreignColumns: [forms.workspaceId, forms.id],
    }).onDelete("cascade"),
    index("form_submissions_form_id_created_at_id_idx").on(
      table.formId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("form_submissions_form_id_email_idx").on(table.formId, table.email),
    index("form_submissions_pending_created_at_idx")
      .on(table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    check(
      "form_submissions_status_check",
      sql`${table.status} in ('pending', 'confirmed', 'subscribed', 'rejected')`,
    ),
    check(
      "form_submissions_email_check",
      sql`${table.email} = lower(${table.email}) and char_length(${table.email}) between 3 and 320`,
    ),
  ],
);
