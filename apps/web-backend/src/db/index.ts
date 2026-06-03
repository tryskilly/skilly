// Repo factory: Postgres when DATABASE_URL is set, otherwise the in-memory repo
// (local dev + the seeded demo tenant). Cached as a module singleton.

import { Pool } from "pg";
import { MemoryRepo } from "./memoryRepo";
import { PostgresRepo } from "./postgresRepo";
import type { WebBackendRepo } from "./repo";

let cachedRepo: WebBackendRepo | null = null;

export function getRepo(): WebBackendRepo {
  if (cachedRepo) {
    return cachedRepo;
  }
  const databaseUrl = process.env.DATABASE_URL;
  cachedRepo = databaseUrl
    ? new PostgresRepo(new Pool({ connectionString: databaseUrl }))
    : new MemoryRepo();
  return cachedRepo;
}
