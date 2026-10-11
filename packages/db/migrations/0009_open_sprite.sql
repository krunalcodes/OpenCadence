CREATE TABLE "sending_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"dkim_selectors" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"checks" jsonb,
	"last_checked_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone,
	"next_check_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sending_domains_status_check" CHECK ("sending_domains"."status" in ('pending', 'verified', 'warning', 'failing')),
	CONSTRAINT "sending_domains_domain_check" CHECK ("sending_domains"."domain" = lower("sending_domains"."domain") and char_length("sending_domains"."domain") between 3 and 253)
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"email" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"contact_id" uuid,
	"consent_text" text,
	"user_agent" text,
	"confirmation_message_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_submissions_status_check" CHECK ("form_submissions"."status" in ('pending', 'confirmed', 'subscribed', 'rejected')),
	CONSTRAINT "form_submissions_email_check" CHECK ("form_submissions"."email" = lower("form_submissions"."email") and char_length("form_submissions"."email") between 3 and 320)
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"list_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"double_opt_in" boolean DEFAULT true NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_id" uuid,
	"submission_count" integer DEFAULT 0 NOT NULL,
	"confirmed_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forms_status_check" CHECK ("forms"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "forms_name_check" CHECK (char_length("forms"."name") between 1 and 120),
	CONSTRAINT "forms_public_id_check" CHECK ("forms"."public_id" ~ '^[a-z0-9]{12,32}$')
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"rfc_message_id" text,
	"in_reply_to" text,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"text" text,
	"html" text,
	"outbound_message_id" uuid,
	"sent_by_user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_messages_direction_check" CHECK ("inbox_messages"."direction" in ('inbound', 'outbound'))
);
--> statement-breakpoint
CREATE TABLE "inbox_threads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"contact_id" uuid,
	"contact_email" text NOT NULL,
	"contact_name" text,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"unread" boolean DEFAULT true NOT NULL,
	"root_message_id" uuid,
	"root_rfc_message_id" text,
	"campaign_id" uuid,
	"sequence_id" uuid,
	"enrollment_id" uuid,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_direction" text DEFAULT 'inbound' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_threads_status_check" CHECK ("inbox_threads"."status" in ('open', 'closed')),
	CONSTRAINT "inbox_threads_last_direction_check" CHECK ("inbox_threads"."last_direction" in ('inbound', 'outbound'))
);
--> statement-breakpoint
ALTER TABLE "message_hourly_stats" DROP CONSTRAINT "message_hourly_stats_kind_check";--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_kind_check";--> statement-breakpoint
ALTER TABLE "sending_source_credentials" DROP CONSTRAINT "sending_source_credentials_auth_type_check";--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "public_name" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "public_description" text;--> statement-breakpoint
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "forms_workspace_id_id_uidx" ON "forms" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_fk" FOREIGN KEY ("workspace_id","form_id") REFERENCES "public"."forms"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_threads_workspace_id_id_uidx" ON "inbox_threads" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_thread_fk" FOREIGN KEY ("workspace_id","thread_id") REFERENCES "public"."inbox_threads"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_threads" ADD CONSTRAINT "inbox_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sending_domains_workspace_id_domain_uidx" ON "sending_domains" USING btree ("workspace_id","domain");--> statement-breakpoint
CREATE INDEX "sending_domains_next_check_at_idx" ON "sending_domains" USING btree ("next_check_at");--> statement-breakpoint
CREATE INDEX "form_submissions_form_id_created_at_id_idx" ON "form_submissions" USING btree ("form_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "form_submissions_form_id_email_idx" ON "form_submissions" USING btree ("form_id","email");--> statement-breakpoint
CREATE INDEX "form_submissions_pending_created_at_idx" ON "form_submissions" USING btree ("created_at") WHERE "form_submissions"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "forms_public_id_uidx" ON "forms" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forms_workspace_id_name_uidx" ON "forms" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_messages_workspace_id_rfc_message_id_uidx" ON "inbox_messages" USING btree ("workspace_id","rfc_message_id") WHERE "inbox_messages"."rfc_message_id" is not null;--> statement-breakpoint
CREATE INDEX "inbox_messages_thread_id_occurred_at_idx" ON "inbox_messages" USING btree ("thread_id","occurred_at");--> statement-breakpoint
CREATE INDEX "inbox_messages_created_at_idx" ON "inbox_messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_threads_root_uidx" ON "inbox_threads" USING btree ("workspace_id","source_id","root_rfc_message_id") WHERE "inbox_threads"."root_rfc_message_id" is not null;--> statement-breakpoint
CREATE INDEX "inbox_threads_workspace_id_status_last_message_at_id_idx" ON "inbox_threads" USING btree ("workspace_id","status","last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "inbox_threads_workspace_id_last_message_at_id_idx" ON "inbox_threads" USING btree ("workspace_id","last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "inbox_threads_workspace_id_unread_idx" ON "inbox_threads" USING btree ("workspace_id","last_message_at" DESC NULLS LAST) WHERE "inbox_threads"."unread" and "inbox_threads"."status" = 'open';--> statement-breakpoint
CREATE INDEX "inbox_threads_workspace_id_contact_email_idx" ON "inbox_threads" USING btree ("workspace_id","contact_email");--> statement-breakpoint
ALTER TABLE "message_hourly_stats" ADD CONSTRAINT "message_hourly_stats_kind_check" CHECK ("message_hourly_stats"."kind" in ('transactional', 'campaign', 'sequence', 'reply', 'test'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_check" CHECK ("kind" in ('transactional', 'campaign', 'sequence', 'reply', 'test'));--> statement-breakpoint
ALTER TABLE "sending_source_credentials" ADD CONSTRAINT "sending_source_credentials_auth_type_check" CHECK ("sending_source_credentials"."auth_type" in ('oauth2', 'api_key', 'password', 'access_key'));