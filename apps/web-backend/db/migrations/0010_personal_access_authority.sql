ALTER TABLE "mac_entitlements"
  ADD COLUMN "trial_seconds_used" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "trial_migration_state" text DEFAULT 'unknown' NOT NULL,
  ADD COLUMN "trial_migrated_at" timestamp with time zone,
  ADD COLUMN "provider_event_at" timestamp with time zone,
  ADD COLUMN "provider_event_id" text;
--> statement-breakpoint
CREATE TABLE "mac_access_sessions" (
  "session_id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "source" text NOT NULL,
  "access_mode" text NOT NULL,
  "period_start" text,
  "period_end" text,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mac_access_sessions_user_time_idx" ON "mac_access_sessions" USING btree ("user_id", "issued_at");
--> statement-breakpoint
ALTER TABLE "mac_usage_events"
  ADD COLUMN "event_id" text,
  ADD COLUMN "session_id" text,
  ADD COLUMN "access_mode" text,
  ADD COLUMN "period_start" text,
  ADD COLUMN "period_end" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "mac_usage_events_user_event_id_key"
  ON "mac_usage_events" USING btree ("user_id", "event_id");
