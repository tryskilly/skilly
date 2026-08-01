ALTER TABLE "mac_entitlements" ADD COLUMN "entitlement_type" text DEFAULT 'relay' NOT NULL;--> statement-breakpoint
ALTER TABLE "mac_entitlements" ADD COLUMN "polar_customer_id" text;--> statement-breakpoint
ALTER TABLE "mac_usage_events" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "mac_usage_events" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "mac_usage_events" ADD COLUMN "audio_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "mac_usage_events" ADD COLUMN "audio_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "mac_usage_events" ADD COLUMN "text_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "mac_usage_events" ADD COLUMN "text_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "mac_usage_events" ADD COLUMN "cached_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "mac_usage_events" ADD COLUMN "total_tokens" integer;--> statement-breakpoint
ALTER TABLE "mac_usage_events" ADD COLUMN "estimated_cost_usd" text;
