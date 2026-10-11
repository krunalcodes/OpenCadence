CREATE TABLE "workspace_ai_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"base_url" text NOT NULL,
	"model" text NOT NULL,
	"key_version" integer NOT NULL,
	"wrapped_data_key" "bytea" NOT NULL,
	"api_key_ciphertext" "bytea" NOT NULL,
	"api_key_hint" text,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_ai_settings_base_url_check" CHECK (char_length("workspace_ai_settings"."base_url") between 1 and 500),
	CONSTRAINT "workspace_ai_settings_model_check" CHECK (char_length("workspace_ai_settings"."model") between 1 and 200),
	CONSTRAINT "workspace_ai_settings_api_key_hint_check" CHECK ("workspace_ai_settings"."api_key_hint" is null or char_length("workspace_ai_settings"."api_key_hint") <= 4)
);
--> statement-breakpoint
CREATE TABLE "workspace_brand_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"brand_name" text DEFAULT '' NOT NULL,
	"website_url" text,
	"logo_media_id" uuid,
	"primary_color" text DEFAULT '#2563eb' NOT NULL,
	"background_color" text DEFAULT '#f4f4f5' NOT NULL,
	"content_color" text DEFAULT '#ffffff' NOT NULL,
	"text_color" text DEFAULT '#18181b' NOT NULL,
	"font_family" text DEFAULT 'system' NOT NULL,
	"postal_address" text,
	"voice" text,
	"social_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_brand_settings_colors_check" CHECK ("workspace_brand_settings"."primary_color" ~ '^#[0-9a-f]{6}$' and "workspace_brand_settings"."background_color" ~ '^#[0-9a-f]{6}$' and "workspace_brand_settings"."content_color" ~ '^#[0-9a-f]{6}$' and "workspace_brand_settings"."text_color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "workspace_brand_settings_font_family_check" CHECK ("workspace_brand_settings"."font_family" in ('system', 'arial', 'helvetica', 'georgia', 'times', 'verdana', 'tahoma', 'trebuchet', 'courier')),
	CONSTRAINT "workspace_brand_settings_brand_name_check" CHECK (char_length("workspace_brand_settings"."brand_name") <= 120),
	CONSTRAINT "workspace_brand_settings_voice_check" CHECK ("workspace_brand_settings"."voice" is null or char_length("workspace_brand_settings"."voice") <= 1000),
	CONSTRAINT "workspace_brand_settings_postal_address_check" CHECK ("workspace_brand_settings"."postal_address" is null or char_length("workspace_brand_settings"."postal_address") <= 500)
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_content_type_check" CHECK ("media_assets"."content_type" in ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
	CONSTRAINT "media_assets_byte_size_check" CHECK ("media_assets"."byte_size" > 0),
	CONSTRAINT "media_assets_file_name_check" CHECK (char_length("media_assets"."file_name") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"preview_text" text DEFAULT '' NOT NULL,
	"document" jsonb,
	"html" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_name_check" CHECK (char_length("templates"."name") between 1 and 120),
	CONSTRAINT "templates_subject_check" CHECK (char_length("templates"."subject") <= 998),
	CONSTRAINT "templates_preview_text_check" CHECK (char_length("templates"."preview_text") <= 300)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_workspace_id_id_uidx" ON "media_assets" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "workspace_ai_settings" ADD CONSTRAINT "workspace_ai_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_ai_settings" ADD CONSTRAINT "workspace_ai_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_brand_settings" ADD CONSTRAINT "workspace_brand_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_brand_settings" ADD CONSTRAINT "workspace_brand_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_brand_settings" ADD CONSTRAINT "workspace_brand_settings_logo_fk" FOREIGN KEY ("workspace_id","logo_media_id") REFERENCES "public"."media_assets"("workspace_id","id") ON DELETE set null ("logo_media_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_workspace_id_created_at_id_idx" ON "media_assets" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "templates_workspace_id_name_uidx" ON "templates" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "templates_workspace_id_id_uidx" ON "templates" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "templates_workspace_id_updated_at_id_idx" ON "templates" USING btree ("workspace_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);