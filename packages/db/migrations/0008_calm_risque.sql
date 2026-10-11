CREATE TABLE "message_hourly_stats" (
	"workspace_id" uuid NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"track_opens" boolean NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"bounced" integer DEFAULT 0 NOT NULL,
	"complained" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"opened" integer DEFAULT 0 NOT NULL,
	"clicked" integer DEFAULT 0 NOT NULL,
	"replied" integer DEFAULT 0 NOT NULL,
	"unsubscribed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "message_hourly_stats_pk" PRIMARY KEY("workspace_id","hour","kind","track_opens"),
	CONSTRAINT "message_hourly_stats_kind_check" CHECK ("message_hourly_stats"."kind" in ('transactional', 'campaign', 'sequence', 'test'))
);
--> statement-breakpoint
ALTER TABLE "sequences" ADD COLUMN "from_email" text;--> statement-breakpoint
ALTER TABLE "message_hourly_stats" ADD CONSTRAINT "message_hourly_stats_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_hourly_stats_hour_idx" ON "message_hourly_stats" USING btree ("hour");