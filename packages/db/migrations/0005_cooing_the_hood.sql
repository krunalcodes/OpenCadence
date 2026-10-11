CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "contact_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_fields_key_check" CHECK ("contact_fields"."key" ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "contact_fields_type_check" CHECK ("contact_fields"."type" in ('text', 'number', 'date', 'boolean', 'select')),
	CONSTRAINT "contact_fields_label_check" CHECK (char_length("contact_fields"."label") between 1 and 80)
);--> statement-breakpoint
CREATE TABLE "contact_tags" (
	"contact_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_tags_pk" PRIMARY KEY("contact_id","tag_id")
);--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"company" text,
	"job_title" text,
	"phone" text,
	"city" text,
	"country" text,
	"timezone" text,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"search_text" text GENERATED ALWAYS AS (lower(email || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(company, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_email_check" CHECK ("contacts"."email" = lower("contacts"."email") and char_length("contacts"."email") between 3 and 320),
	CONSTRAINT "contacts_origin_check" CHECK ("contacts"."origin" in ('manual', 'import', 'api', 'form'))
);--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sample_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mapping" jsonb,
	"options" jsonb,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_report_key" text,
	"error_message" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "imports_status_check" CHECK ("imports"."status" in ('uploaded', 'queued', 'running', 'completed', 'failed', 'cancelled'))
);--> statement-breakpoint
CREATE TABLE "list_members" (
	"list_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text DEFAULT 'subscribed' NOT NULL,
	"subscribed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_members_pk" PRIMARY KEY("list_id","contact_id"),
	CONSTRAINT "list_members_status_check" CHECK ("list_members"."status" in ('subscribed', 'unsubscribed'))
);--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lists_name_check" CHECK (char_length("lists"."name") between 1 and 80)
);--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rules" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "segments_name_check" CHECK (char_length("segments"."name") between 1 and 80)
);--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_check" CHECK (char_length("tags"."name") between 1 and 50)
);--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_workspace_id_id_uidx" ON "contacts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "lists_workspace_id_id_uidx" ON "lists" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_id_id_uidx" ON "tags" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "contact_fields" ADD CONSTRAINT "contact_fields_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_fk" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "public"."tags"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_fk" FOREIGN KEY ("workspace_id","list_id") REFERENCES "public"."lists"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_fields_workspace_id_key_uidx" ON "contact_fields" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "contact_tags_tag_id_contact_id_idx" ON "contact_tags" USING btree ("tag_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_workspace_id_email_uidx" ON "contacts" USING btree ("workspace_id","email" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "contacts_workspace_id_created_at_id_idx" ON "contacts" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "contacts_fields_idx" ON "contacts" USING gin ("fields" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "contacts_search_text_idx" ON "contacts" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "imports_workspace_id_created_at_idx" ON "imports" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "imports_created_by_user_id_idx" ON "imports" USING btree ("created_by_user_id") WHERE "imports"."created_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "list_members_contact_id_idx" ON "list_members" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "list_members_list_id_status_idx" ON "list_members" USING btree ("list_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "lists_workspace_id_name_uidx" ON "lists" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "segments_workspace_id_name_uidx" ON "segments" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "segments_created_by_user_id_idx" ON "segments" USING btree ("created_by_user_id") WHERE "segments"."created_by_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_id_name_uidx" ON "tags" USING btree ("workspace_id",lower("name"));
