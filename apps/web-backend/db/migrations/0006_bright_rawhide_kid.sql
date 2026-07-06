ALTER TABLE "tenant_widget_configs" ADD COLUMN "actions_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "count" integer;