ALTER TABLE "usage_events" ADD COLUMN "page" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "result" text;