-- Skilly web SDK — multi-tenant control plane schema (Postgres).
-- Phase 8.4. Billing columns (Polar) are added in Phase 8.6.

-- A site owner who embeds @skilly/web on their app.
CREATE TABLE IF NOT EXISTS tenants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  -- Origins allowed to use this tenant's publishable key. Supports a single
  -- "*.example.com" wildcard label, e.g. 'https://*.acme.com'.
  allowed_origins  TEXT[] NOT NULL DEFAULT '{}',
  -- Monthly usage cap in seconds (0 = unlimited). Mirrors the desktop UsageTracker cap.
  usage_cap_seconds INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Publishable (pk_) and secret (sk_) API keys. Only a hash is stored.
CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_type    TEXT NOT NULL CHECK (key_type IN ('publishable', 'secret')),
  key_hash    TEXT NOT NULL UNIQUE,   -- sha256(raw key)
  key_prefix  TEXT NOT NULL,          -- e.g. 'pk_live' for display
  key_last4   TEXT NOT NULL,          -- last 4 chars for display
  revoked     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_tenant_idx ON api_keys (tenant_id);

-- The tenant's authored teaching skill (compiled SKILL.md served to the widget).
CREATE TABLE IF NOT EXISTS tenant_skills (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  skill_id    TEXT NOT NULL,
  content     TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, skill_id)
);

-- Metered usage events (token mints / session seconds) → drives quota + billing.
CREATE TABLE IF NOT EXISTS usage_events (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,          -- 'token_mint' | 'session_seconds'
  seconds     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_tenant_time_idx ON usage_events (tenant_id, created_at);
