// Repo factory: Postgres when DATABASE_URL is set, otherwise the in-memory repo
// (local dev + the seeded demo tenant). Cached as a module singleton.

import { Pool } from "pg";
import { MemoryRepo } from "./memoryRepo";
import { PostgresRepo } from "./postgresRepo";
import type { WebBackendRepo } from "./repo";

declare global {
  // eslint-disable-next-line no-var
  var __skillyRepo: WebBackendRepo | undefined;
}

export function getRepoMode(): "memory" | "postgres" {
  return getDatabaseUrl() ? "postgres" : "memory";
}

export function getRepo(): WebBackendRepo {
  const existing = globalThis.__skillyRepo;
  if (existing) {
    return existing;
  }
  const databaseUrl = getDatabaseUrl();
  globalThis.__skillyRepo = databaseUrl
    ? new PostgresRepo(new Pool({ connectionString: databaseUrl }))
    : new MemoryRepo();
  return globalThis.__skillyRepo;
}

export function getDatabaseUrl(): string | undefined {
  return process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
}
