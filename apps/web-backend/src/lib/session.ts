// Resolves which tenant the dashboard is acting as.
//
// Dev / demo: act as the seeded in-memory demo tenant (no auth) so the
// dashboard is usable out of the box. Production resolves the tenant from a
// WorkOS session — the desktop app already uses WorkOS AuthKit, so the backend
// verifies the same session and maps the WorkOS user to a tenant. Wiring that
// auth is a follow-up; this seam keeps the dashboard code unchanged when it lands.

import { defaultSeed } from "@/db/memoryRepo";

export function getCurrentTenantId(): string {
  return process.env.SKILLY_TENANT_ID ?? defaultSeed().tenants[0]!.id;
}

export const DEFAULT_SKILL_ID = "acme-onboarding";
