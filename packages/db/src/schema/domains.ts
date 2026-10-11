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

export type DomainRecordCheck = {
  status: "pass" | "warning" | "fail" | "missing";
  host: string;
  found: string[];
  expected: string | null;
  code: string | null;
};

export type DomainChecks = {
  spf: DomainRecordCheck | null;
  dkim: (DomainRecordCheck & { selector: string })[];
  dmarc: (DomainRecordCheck & { policy: string | null }) | null;
  mx: DomainRecordCheck | null;
};

export const sendingDomains = pgTable(
  "sending_domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    dkimSelectors: text("dkim_selectors")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    status: text("status").default("pending").notNull(),
    checks: jsonb("checks").$type<DomainChecks>(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
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
    uniqueIndex("sending_domains_workspace_id_domain_uidx").on(
      table.workspaceId,
      table.domain,
    ),
    index("sending_domains_next_check_at_idx").on(table.nextCheckAt),
    check(
      "sending_domains_status_check",
      sql`${table.status} in ('pending', 'verified', 'warning', 'failing')`,
    ),
    check(
      "sending_domains_domain_check",
      sql`${table.domain} = lower(${table.domain}) and char_length(${table.domain}) between 3 and 253`,
    ),
  ],
);
