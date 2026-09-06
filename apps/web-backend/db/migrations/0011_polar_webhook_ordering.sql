ALTER TABLE "tenants"
  ADD COLUMN "provider_event_at" timestamp with time zone,
  ADD COLUMN "provider_event_id" text;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "provider_state" text;
--> statement-breakpoint
ALTER TABLE "mac_entitlements" ADD COLUMN "provider_event_state" text;
--> statement-breakpoint
CREATE TABLE "polar_webhook_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "provider_event_at" timestamp with time zone,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL
);
