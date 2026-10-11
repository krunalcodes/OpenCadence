CREATE TABLE "warmup_mailboxes" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"paused_reason" text,
	"domain" text NOT NULL,
	"identifier" text NOT NULL,
	"started_on" date,
	"hold_days" integer DEFAULT 0 NOT NULL,
	"start_per_day" smallint DEFAULT 5 NOT NULL,
	"increment_per_day" smallint DEFAULT 2 NOT NULL,
	"max_per_day" smallint DEFAULT 30 NOT NULL,
	"randomize" boolean DEFAULT true NOT NULL,
	"reply_rate" smallint DEFAULT 30 NOT NULL,
	"weekdays_only" boolean DEFAULT false NOT NULL,
	"planned_on" date,
	"planned_count" smallint DEFAULT 0 NOT NULL,
	"folder_id" text,
	"last_synced_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warmup_mailboxes_volume_check" CHECK ("warmup_mailboxes"."start_per_day" between 1 and 50 and "warmup_mailboxes"."increment_per_day" between 1 and 5 and "warmup_mailboxes"."max_per_day" between 1 and 50 and "warmup_mailboxes"."start_per_day" <= "warmup_mailboxes"."max_per_day"),
	CONSTRAINT "warmup_mailboxes_reply_rate_check" CHECK ("warmup_mailboxes"."reply_rate" between 0 and 60),
	CONSTRAINT "warmup_mailboxes_paused_reason_check" CHECK ("warmup_mailboxes"."paused_reason" is null or "warmup_mailboxes"."paused_reason" in ('manual', 'source_unavailable', 'sign_in_failed', 'bounces'))
);
--> statement-breakpoint
CREATE TABLE "warmup_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"thread_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sender_source_id" uuid NOT NULL,
	"sender_workspace_id" uuid NOT NULL,
	"recipient_source_id" uuid NOT NULL,
	"recipient_workspace_id" uuid NOT NULL,
	"rfc_message_id" text NOT NULL,
	"in_reply_to" text,
	"subject" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"reply_planned" boolean DEFAULT false NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"landed_in" text,
	"rescued" boolean DEFAULT false NOT NULL,
	"error_code" text,
	CONSTRAINT "warmup_messages_kind_check" CHECK ("warmup_messages"."kind" in ('opener', 'reply')),
	CONSTRAINT "warmup_messages_status_check" CHECK ("warmup_messages"."status" in ('scheduled', 'sent', 'received', 'missing', 'failed')),
	CONSTRAINT "warmup_messages_landed_in_check" CHECK ("warmup_messages"."landed_in" is null or "warmup_messages"."landed_in" in ('inbox', 'spam'))
);
--> statement-breakpoint
ALTER TABLE "warmup_mailboxes" ADD CONSTRAINT "warmup_mailboxes_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."sending_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_messages" ADD CONSTRAINT "warmup_messages_sender_fk" FOREIGN KEY ("sender_workspace_id","sender_source_id") REFERENCES "public"."sending_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_messages" ADD CONSTRAINT "warmup_messages_recipient_fk" FOREIGN KEY ("recipient_workspace_id","recipient_source_id") REFERENCES "public"."sending_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warmup_mailboxes_workspace_id_idx" ON "warmup_mailboxes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "warmup_mailboxes_pool_idx" ON "warmup_mailboxes" USING btree ("domain") WHERE "warmup_mailboxes"."enabled" and "warmup_mailboxes"."paused_reason" is null;--> statement-breakpoint
CREATE INDEX "warmup_messages_sender_source_id_created_at_idx" ON "warmup_messages" USING btree ("sender_source_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "warmup_messages_recipient_pending_idx" ON "warmup_messages" USING btree ("recipient_source_id","sent_at") WHERE "warmup_messages"."status" = 'sent';--> statement-breakpoint
CREATE INDEX "warmup_messages_due_idx" ON "warmup_messages" USING btree ("send_at") WHERE "warmup_messages"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "warmup_messages_created_at_idx" ON "warmup_messages" USING btree ("created_at");