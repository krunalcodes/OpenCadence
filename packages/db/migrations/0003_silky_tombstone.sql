CREATE TABLE "message_contents" (
	"message_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"workspace_id" uuid NOT NULL,
	"html" text,
	"text" text,
	"headers" jsonb,
	CONSTRAINT "message_contents_pk" PRIMARY KEY("message_id","created_at")
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
CREATE TABLE "message_idempotency_keys" (
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"message_id" uuid NOT NULL,
	"message_created_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_idempotency_keys_pk" PRIMARY KEY("workspace_id","key"),
	CONSTRAINT "message_idempotency_keys_key_check" CHECK (char_length("message_idempotency_keys"."key") between 1 and 256)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_emails" text[] NOT NULL,
	"cc_emails" text[],
	"bcc_emails" text[],
	"suppressed_emails" text[],
	"reply_to" text,
	"subject" text NOT NULL,
	"tags" jsonb,
	"rfc_message_id" text,
	"provider_message_id" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_pk" PRIMARY KEY("id","created_at"),
	CONSTRAINT "messages_kind_check" CHECK ("messages"."kind" in ('transactional', 'campaign', 'sequence', 'test')),
	CONSTRAINT "messages_status_check" CHECK ("messages"."status" in ('queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'skipped')),
	CONSTRAINT "messages_to_emails_check" CHECK (cardinality("messages"."to_emails") between 1 and 50)
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"origin" text NOT NULL,
	"source_id" uuid,
	"message_id" uuid,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppressions_reason_check" CHECK ("suppressions"."reason" in ('unsubscribed', 'bounced', 'complained', 'manual')),
	CONSTRAINT "suppressions_origin_check" CHECK ("suppressions"."origin" in ('user', 'api', 'webhook', 'import')),
	CONSTRAINT "suppressions_email_check" CHECK ("suppressions"."email" = lower("suppressions"."email") and char_length("suppressions"."email") between 3 and 320)
);
--> statement-breakpoint
ALTER TABLE "sending_sources" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "message_contents" ADD CONSTRAINT "message_contents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_idempotency_keys" ADD CONSTRAINT "message_idempotency_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."sending_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_contents_workspace_id_idx" ON "message_contents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "message_idempotency_keys_created_at_idx" ON "message_idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_workspace_id_created_at_id_idx" ON "messages" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_workspace_id_status_created_at_id_idx" ON "messages" USING btree ("workspace_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_source_id_provider_message_id_idx" ON "messages" USING btree ("source_id","provider_message_id") WHERE "messages"."provider_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_workspace_id_email_reason_uidx" ON "suppressions" USING btree ("workspace_id","email" text_pattern_ops,"reason");--> statement-breakpoint
CREATE INDEX "suppressions_workspace_id_created_at_id_idx" ON "suppressions" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "suppressions_workspace_id_reason_created_at_id_idx" ON "suppressions" USING btree ("workspace_id","reason","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "suppressions_created_by_user_id_idx" ON "suppressions" USING btree ("created_by_user_id") WHERE "suppressions"."created_by_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sending_sources_workspace_id_default_uidx" ON "sending_sources" USING btree ("workspace_id") WHERE "sending_sources"."is_default" and "sending_sources"."status" <> 'disconnected';--> statement-breakpoint
CREATE TABLE "messages_default" PARTITION OF "messages" DEFAULT;--> statement-breakpoint
CREATE TABLE "message_contents_default" PARTITION OF "message_contents" DEFAULT;--> statement-breakpoint
DO $$
DECLARE
	start_at timestamptz;
	parent text;
BEGIN
	FOREACH parent IN ARRAY ARRAY['messages', 'message_contents'] LOOP
		FOR i IN 0..3 LOOP
			start_at := (date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i)) AT TIME ZONE 'UTC';
			EXECUTE format(
				'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
				parent || '_' || to_char(start_at AT TIME ZONE 'UTC', 'YYYY_MM'),
				parent,
				start_at,
				((start_at AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'
			);
		END LOOP;
	END LOOP;
END $$;
