CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"skill_id" text DEFAULT 'default' NOT NULL,
	"skill_content" text DEFAULT '' NOT NULL,
	"allowed_origins" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_app_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"accent_color" text DEFAULT '#f59e0b' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"launcher_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_tenant_slug_key" UNIQUE("tenant_id","slug"),
	CONSTRAINT "projects_tenant_skill_id_key" UNIQUE("tenant_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_tenant_idx" ON "projects" USING btree ("tenant_id");--> statement-breakpoint
INSERT INTO "projects" (
	"tenant_id",
	"name",
	"slug",
	"skill_id",
	"skill_content",
	"allowed_origins",
	"allowed_app_ids",
	"accent_color",
	"locale",
	"launcher_label"
)
SELECT
	t.id,
	'Primary project',
	'primary',
	COALESCE(skill.skill_id, 'default'),
	COALESCE(skill.content, ''),
	t.allowed_origins,
	t.allowed_app_ids,
	COALESCE(config.accent_color, '#f59e0b'),
	COALESCE(config.locale, 'en'),
	config.launcher_label
FROM tenants t
LEFT JOIN LATERAL (
	SELECT skill_id, content
	FROM tenant_skills
	WHERE tenant_id = t.id
	ORDER BY CASE WHEN skill_id = 'default' THEN 0 ELSE 1 END, skill_id ASC
	LIMIT 1
) skill ON true
LEFT JOIN tenant_widget_configs config ON config.tenant_id = t.id
ON CONFLICT ("tenant_id","slug") DO NOTHING;
