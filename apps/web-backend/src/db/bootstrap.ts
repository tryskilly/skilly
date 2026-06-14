import { Pool } from "pg";
import { getDatabaseUrl } from "./index";
import { runMigrations } from "./migrate";

const DEMO_SEED_SQL = `
INSERT INTO tenants (
  id,
  name,
  allowed_origins,
  allowed_app_ids,
  usage_cap_seconds
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Acme Inc. (demo)',
  ARRAY['http://localhost:4399', 'http://localhost:4310', 'https://*.acme.com'],
  ARRAY['com.acme.demo', 'app.tryskilly.demo'],
  10800
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  allowed_origins = EXCLUDED.allowed_origins,
  allowed_app_ids = EXCLUDED.allowed_app_ids,
  usage_cap_seconds = EXCLUDED.usage_cap_seconds;

INSERT INTO dashboard_memberships (
  workos_user_id,
  tenant_id,
  role,
  email
) VALUES (
  'user_01KP21J3GEVH8AKJ31C59Z1KJQ',
  '11111111-1111-1111-1111-111111111111',
  'super_admin',
  'admin@tryskilly.app'
) ON CONFLICT (workos_user_id, tenant_id) DO UPDATE SET
  role = EXCLUDED.role,
  email = EXCLUDED.email;

INSERT INTO api_keys (
  tenant_id,
  key_type,
  key_hash,
  key_prefix,
  key_last4
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'publishable',
  'b015dff88c51bf3d106861fe68f3c0b1ab4982e13f8afbb8a94e418e2dce25d1',
  'pk_test',
  'al01'
) ON CONFLICT (key_hash) DO NOTHING;

INSERT INTO tenant_skills (
  tenant_id,
  skill_id,
  content
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'acme-onboarding',
  '# Acme Onboarding

Guide the user through setting up their first project.'
) ON CONFLICT (tenant_id, skill_id) DO UPDATE SET
  content = EXCLUDED.content,
  updated_at = now();
`;

export async function bootstrapControlPlaneDatabase(): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await runMigrations();
    await pool.query(DEMO_SEED_SQL);
  } finally {
    await pool.end();
  }
}
