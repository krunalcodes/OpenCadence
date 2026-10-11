import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth";
import { mediaAssets } from "./media";

export type BrandSocialLink = { network: string; url: string };

export const workspaceBrandSettings = pgTable(
  "workspace_brand_settings",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandName: text("brand_name").default("").notNull(),
    websiteUrl: text("website_url"),
    logoMediaId: uuid("logo_media_id"),
    primaryColor: text("primary_color").default("#2563eb").notNull(),
    backgroundColor: text("background_color").default("#f4f4f5").notNull(),
    contentColor: text("content_color").default("#ffffff").notNull(),
    textColor: text("text_color").default("#18181b").notNull(),
    fontFamily: text("font_family").default("system").notNull(),
    postalAddress: text("postal_address"),
    voice: text("voice"),
    socialLinks: jsonb("social_links")
      .$type<BrandSocialLink[]>()
      .default([])
      .notNull(),
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
    foreignKey({
      name: "workspace_brand_settings_logo_fk",
      columns: [table.workspaceId, table.logoMediaId],
      foreignColumns: [mediaAssets.workspaceId, mediaAssets.id],
    }),
    check(
      "workspace_brand_settings_colors_check",
      sql`${table.primaryColor} ~ '^#[0-9a-f]{6}$' and ${table.backgroundColor} ~ '^#[0-9a-f]{6}$' and ${table.contentColor} ~ '^#[0-9a-f]{6}$' and ${table.textColor} ~ '^#[0-9a-f]{6}$'`,
    ),
    check(
      "workspace_brand_settings_font_family_check",
      sql`${table.fontFamily} in ('system', 'arial', 'helvetica', 'georgia', 'times', 'verdana', 'tahoma', 'trebuchet', 'courier')`,
    ),
    check(
      "workspace_brand_settings_brand_name_check",
      sql`char_length(${table.brandName}) <= 120`,
    ),
    check(
      "workspace_brand_settings_voice_check",
      sql`${table.voice} is null or char_length(${table.voice}) <= 1000`,
    ),
    check(
      "workspace_brand_settings_postal_address_check",
      sql`${table.postalAddress} is null or char_length(${table.postalAddress}) <= 500`,
    ),
  ],
);
