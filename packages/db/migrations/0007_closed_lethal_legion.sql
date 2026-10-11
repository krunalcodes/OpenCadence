CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"template_id" uuid,
	"subject" text DEFAULT '' NOT NULL,
	"preview_text" text DEFAULT '' NOT NULL,
	"from_name" text,
	"from_email" text,
	"reply_to" text,
	"source_id" uuid,
	"audience" jsonb,
	"track_opens" boolean DEFAULT true NOT NULL,
	"track_clicks" boolean DEFAULT true NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"snapshot_id" uuid,
	"fanout_cursor" uuid,
	"fanout_done_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"bounced_count" integer DEFAULT 0 NOT NULL,
	"complained_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"opened_count" integer DEFAULT 0 NOT NULL,
	"clicked_count" integer DEFAULT 0 NOT NULL,
	"unsubscribed_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_status_check" CHECK ("campaigns"."status" in ('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled', 'failed')),
	CONSTRAINT "campaigns_name_check" CHECK (char_length("campaigns"."name") between 1 and 120),
	CONSTRAINT "campaigns_subject_check" CHECK (char_length("campaigns"."subject") <= 998)
);
--> statement-breakpoint
CREATE TABLE "content_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"preview_text" text DEFAULT '' NOT NULL,
	"html" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_events" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"message_created_at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"url" text,
	"user_agent" text,
	"metadata" jsonb,
	CONSTRAINT "message_events_pk" PRIMARY KEY("id","created_at"),
	CONSTRAINT "message_events_type_check" CHECK ("message_events"."type" in ('sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'opened', 'clicked', 'replied', 'unsubscribed'))
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
CREATE TABLE "sequence_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source_id" uuid,
	"next_step_position" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone,
	"thread_root_rfc_id" text,
	"thread_subject" text,
	"last_message_id" uuid,
	"last_sent_at" timestamp with time zone,
	"finish_reason" text,
	"finished_at" timestamp with time zone,
	"enrolled_by_user_id" uuid,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sequence_enrollments_status_check" CHECK ("sequence_enrollments"."status" in ('active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed', 'failed', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "sequence_reply_cursors" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"last_checked_at" timestamp with time zone,
	"state" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" text DEFAULT 'email' NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"template_id" uuid,
	"subject" text DEFAULT '' NOT NULL,
	"thread_mode" text DEFAULT 'reply' NOT NULL,
	"snapshot_id" uuid,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"opened_count" integer DEFAULT 0 NOT NULL,
	"clicked_count" integer DEFAULT 0 NOT NULL,
	"replied_count" integer DEFAULT 0 NOT NULL,
	"bounced_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sequence_steps_type_check" CHECK ("sequence_steps"."type" in ('email')),
	CONSTRAINT "sequence_steps_thread_mode_check" CHECK ("sequence_steps"."thread_mode" in ('reply', 'new')),
	CONSTRAINT "sequence_steps_delay_minutes_check" CHECK ("sequence_steps"."delay_minutes" between 0 and 525600),
	CONSTRAINT "sequence_steps_position_check" CHECK ("sequence_steps"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"from_name" text,
	"track_opens" boolean DEFAULT false NOT NULL,
	"track_clicks" boolean DEFAULT false NOT NULL,
	"stop_on_reply" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"send_days" smallint[] DEFAULT '{1,2,3,4,5}'::smallint[] NOT NULL,
	"window_start_minute" smallint DEFAULT 540 NOT NULL,
	"window_end_minute" smallint DEFAULT 1020 NOT NULL,
	"daily_limit_per_source" integer,
	"layout" jsonb,
	"enrolled_count" integer DEFAULT 0 NOT NULL,
	"active_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"replied_count" integer DEFAULT 0 NOT NULL,
	"bounced_count" integer DEFAULT 0 NOT NULL,
	"unsubscribed_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"opened_count" integer DEFAULT 0 NOT NULL,
	"clicked_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sequences_status_check" CHECK ("sequences"."status" in ('draft', 'active', 'paused', 'archived')),
	CONSTRAINT "sequences_name_check" CHECK (char_length("sequences"."name") between 1 and 120),
	CONSTRAINT "sequences_window_check" CHECK ("sequences"."window_start_minute" between 0 and 1439 and "sequences"."window_end_minute" between 1 and 1440 and "sequences"."window_start_minute" < "sequences"."window_end_minute"),
	CONSTRAINT "sequences_send_days_check" CHECK (cardinality("sequences"."send_days") between 1 and 7 and "sequences"."send_days" <@ '{1,2,3,4,5,6,7}'::smallint[])
);
--> statement-breakpoint
ALTER TABLE "message_contents" ADD COLUMN "snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "message_contents" ADD COLUMN "variables" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sequence_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sequence_step_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "enrollment_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "track_opens" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "track_clicks" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "unsubscribe_list_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "first_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "open_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "first_clicked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "click_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "unsubscribed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_snapshots" ADD CONSTRAINT "content_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sequences_workspace_id_id_uidx" ON "sequences" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_fk" FOREIGN KEY ("workspace_id","sequence_id") REFERENCES "public"."sequences"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_reply_cursors" ADD CONSTRAINT "sequence_reply_cursors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_fk" FOREIGN KEY ("workspace_id","sequence_id") REFERENCES "public"."sequences"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_workspace_id_id_uidx" ON "campaigns" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "campaigns_workspace_id_created_at_id_idx" ON "campaigns" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "campaigns_workspace_id_status_created_at_id_idx" ON "campaigns" USING btree ("workspace_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "campaigns_scheduled_at_idx" ON "campaigns" USING btree ("scheduled_at") WHERE "campaigns"."status" = 'scheduled';--> statement-breakpoint
CREATE UNIQUE INDEX "content_snapshots_workspace_id_id_uidx" ON "content_snapshots" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "message_events_message_id_created_at_idx" ON "message_events" USING btree ("message_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "message_events_workspace_id_created_at_id_idx" ON "message_events" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_enrollments_sequence_id_contact_id_uidx" ON "sequence_enrollments" USING btree ("sequence_id","contact_id");--> statement-breakpoint
CREATE INDEX "sequence_enrollments_due_idx" ON "sequence_enrollments" USING btree ("next_run_at") WHERE "sequence_enrollments"."status" = 'active';--> statement-breakpoint
CREATE INDEX "sequence_enrollments_sequence_id_status_enrolled_at_id_idx" ON "sequence_enrollments" USING btree ("sequence_id","status","enrolled_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sequence_enrollments_sequence_id_enrolled_at_id_idx" ON "sequence_enrollments" USING btree ("sequence_id","enrolled_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sequence_enrollments_contact_id_idx" ON "sequence_enrollments" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_steps_sequence_id_position_uidx" ON "sequence_steps" USING btree ("sequence_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "sequences_workspace_id_name_uidx" ON "sequences" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "sequences_workspace_id_created_at_id_idx" ON "sequences" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_campaign_id_created_at_id_idx" ON "messages" USING btree ("campaign_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "messages"."campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_campaign_id_status_idx" ON "messages" USING btree ("campaign_id","status") WHERE "messages"."campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_enrollment_id_created_at_idx" ON "messages" USING btree ("enrollment_id","created_at" DESC NULLS LAST) WHERE "messages"."enrollment_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_sequence_id_created_at_id_idx" ON "messages" USING btree ("sequence_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "messages"."sequence_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_contact_id_created_at_idx" ON "messages" USING btree ("workspace_id","contact_id","created_at" DESC NULLS LAST) WHERE "messages"."contact_id" is not null;--> statement-breakpoint
CREATE TABLE "message_events_default" PARTITION OF "message_events" DEFAULT;--> statement-breakpoint
DO $$
DECLARE
	start_at timestamptz;
BEGIN
	FOR i IN 0..3 LOOP
		start_at := (date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i)) AT TIME ZONE 'UTC';
		EXECUTE format(
			'CREATE TABLE IF NOT EXISTS %I PARTITION OF "message_events" FOR VALUES FROM (%L) TO (%L)',
			'message_events_' || to_char(start_at AT TIME ZONE 'UTC', 'YYYY_MM'),
			start_at,
			((start_at AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'
		);
	END LOOP;
END $$;
