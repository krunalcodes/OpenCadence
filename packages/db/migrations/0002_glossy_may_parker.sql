CREATE TABLE "sending_source_credentials" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"auth_type" text NOT NULL,
	"key_version" integer NOT NULL,
	"wrapped_data_key" "bytea" NOT NULL,
	"secret_ciphertext" "bytea" NOT NULL,
	"secret_hint" text,
	"access_token_ciphertext" "bytea",
	"access_token_expires_at" timestamp with time zone,
	"scopes" text[],
	"webhook_external_id" text,
	"webhook_secret_ciphertext" "bytea",
	"secret_rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sending_source_credentials_auth_type_check" CHECK ("sending_source_credentials"."auth_type" in ('oauth2', 'api_key', 'password')),
	CONSTRAINT "sending_source_credentials_secret_hint_check" CHECK ("sending_source_credentials"."secret_hint" is null or char_length("sending_source_credentials"."secret_hint") <= 4)
);
--> statement-breakpoint
CREATE TABLE "sending_source_daily_stats" (
	"source_id" uuid NOT NULL,
	"day" date NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"health" text DEFAULT 'healthy' NOT NULL,
	"daily_send_limit" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sending_source_daily_stats_pk" PRIMARY KEY("source_id","day"),
	CONSTRAINT "sending_source_daily_stats_health_check" CHECK ("sending_source_daily_stats"."health" in ('healthy', 'warning', 'failing')),
	CONSTRAINT "sending_source_daily_stats_counts_check" CHECK ("sending_source_daily_stats"."sent_count" >= 0 and "sending_source_daily_stats"."error_count" >= 0 and "sending_source_daily_stats"."warning_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sending_source_events" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"severity" smallint NOT NULL,
	"type" text NOT NULL,
	"code" text,
	"message" text,
	"metadata" jsonb,
	"actor_user_id" uuid,
	CONSTRAINT "sending_source_events_pk" PRIMARY KEY("id","created_at"),
	CONSTRAINT "sending_source_events_severity_check" CHECK ("sending_source_events"."severity" between 1 and 3)
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
CREATE TABLE "sending_source_webhook_receipts" (
	"source_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sending_source_webhook_receipts_pk" PRIMARY KEY("source_id","provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "sending_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_type" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"external_account_id" text,
	"email" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"daily_send_limit" integer,
	"last_error_code" text,
	"last_error_message" text,
	"last_error_at" timestamp with time zone,
	"last_tested_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sending_sources_status_check" CHECK ("sending_sources"."status" in ('active', 'paused', 'needs_attention', 'disconnected')),
	CONSTRAINT "sending_sources_integration_type_check" CHECK ("sending_sources"."integration_type" ~ '^[a-z][a-z0-9-]{1,39}$'),
	CONSTRAINT "sending_sources_name_check" CHECK (char_length("sending_sources"."name") between 1 and 80),
	CONSTRAINT "sending_sources_daily_send_limit_check" CHECK ("sending_sources"."daily_send_limit" is null or "sending_sources"."daily_send_limit" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sending_sources_workspace_id_id_uidx" ON "sending_sources" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "sending_source_credentials" ADD CONSTRAINT "sending_source_credentials_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."sending_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_source_daily_stats" ADD CONSTRAINT "sending_source_daily_stats_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."sending_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_source_events" ADD CONSTRAINT "sending_source_events_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."sending_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_source_webhook_receipts" ADD CONSTRAINT "sending_source_webhook_receipts_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."sending_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_sources" ADD CONSTRAINT "sending_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_sources" ADD CONSTRAINT "sending_sources_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sending_source_credentials_key_version_idx" ON "sending_source_credentials" USING btree ("key_version");--> statement-breakpoint
CREATE INDEX "sending_source_credentials_access_token_expires_at_idx" ON "sending_source_credentials" USING btree ("access_token_expires_at") WHERE "sending_source_credentials"."access_token_expires_at" is not null;--> statement-breakpoint
CREATE INDEX "sending_source_daily_stats_workspace_id_day_idx" ON "sending_source_daily_stats" USING btree ("workspace_id","day");--> statement-breakpoint
CREATE INDEX "sending_source_events_workspace_id_created_at_id_idx" ON "sending_source_events" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sending_source_events_workspace_id_source_id_created_at_id_idx" ON "sending_source_events" USING btree ("workspace_id","source_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sending_source_events_workspace_id_problems_idx" ON "sending_source_events" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "sending_source_events"."severity" >= 2;--> statement-breakpoint
CREATE INDEX "sending_source_webhook_receipts_received_at_idx" ON "sending_source_webhook_receipts" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sending_sources_workspace_id_name_uidx" ON "sending_sources" USING btree ("workspace_id",lower("name")) WHERE "sending_sources"."status" <> 'disconnected';--> statement-breakpoint
CREATE UNIQUE INDEX "sending_sources_workspace_id_type_external_account_id_uidx" ON "sending_sources" USING btree ("workspace_id","integration_type","external_account_id") WHERE "sending_sources"."external_account_id" is not null and "sending_sources"."status" <> 'disconnected';--> statement-breakpoint
CREATE INDEX "sending_sources_workspace_id_status_idx" ON "sending_sources" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "sending_sources_created_by_user_id_idx" ON "sending_sources" USING btree ("created_by_user_id") WHERE "sending_sources"."created_by_user_id" is not null;--> statement-breakpoint
CREATE TABLE "sending_source_events_default" PARTITION OF "sending_source_events" DEFAULT;--> statement-breakpoint
DO $$
DECLARE
	start_at timestamptz;
BEGIN
	FOR i IN 0..3 LOOP
		start_at := (date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i)) AT TIME ZONE 'UTC';
		EXECUTE format(
			'CREATE TABLE IF NOT EXISTS %I PARTITION OF "sending_source_events" FOR VALUES FROM (%L) TO (%L)',
			'sending_source_events_' || to_char(start_at AT TIME ZONE 'UTC', 'YYYY_MM'),
			start_at,
			((start_at AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'
		);
	END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "sending_source_daily_stats" SET (fillfactor = 80, autovacuum_vacuum_scale_factor = 0.02);--> statement-breakpoint
ALTER TABLE "sending_source_credentials" SET (fillfactor = 80);
