CREATE TABLE "tenant_widget_configs" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"accent_color" text DEFAULT '#f59e0b' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"launcher_label" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_widget_configs" ADD CONSTRAINT "tenant_widget_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;