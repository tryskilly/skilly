import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { Pool, type PoolClient } from "pg";

interface Options {
  apply: boolean;
  namespaceId: string;
  limit: number | null;
  prefix: string;
}

interface KvKey {
  name: string;
}

interface WorkerEntitlementRecord {
  user_id?: string;
  status?: "active" | "canceled" | "none";
  period_start?: string | null;
  period_end?: string | null;
  plan?: string | null;
}

const DEFAULT_NAMESPACE_ID = "d05cca70637d4355b982da6e0a15a1fa";
const WORKER_DIR = process.env.SKILLY_WORKER_DIR ?? fileURLToPath(new URL("../../../worker", import.meta.url));

function parseArgs(argv: string[]): Options {
  const options: Options = {
    apply: false,
    namespaceId: process.env.SKILLY_WORKER_KV_NAMESPACE_ID ?? DEFAULT_NAMESPACE_ID,
    limit: null,
    prefix: "user:",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg === "--namespace-id") {
      options.namespaceId = requiredValue(argv[++index], "--namespace-id");
    } else if (arg === "--prefix") {
      options.prefix = requiredValue(argv[++index], "--prefix");
    } else if (arg === "--limit") {
      options.limit = parseNonNegativeInt(requiredValue(argv[++index], "--limit"), "--limit");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requiredValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parseNonNegativeInt(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function runWrangler(args: string[], cwd = WORKER_DIR): string {
  const result = spawnSync("npm", ["exec", "--", "wrangler", ...args], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`wrangler ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function listKvKeys(options: Options): KvKey[] {
  const output = runWrangler([
    "kv",
    "key",
    "list",
    "--namespace-id",
    options.namespaceId,
    "--prefix",
    options.prefix,
  ]);
  const keys = JSON.parse(output || "[]") as KvKey[];
  return options.limit === null ? keys : keys.slice(0, options.limit);
}

function readKvJson(namespaceId: string, key: string): WorkerEntitlementRecord | null {
  const output = runWrangler(["kv", "key", "get", key, "--namespace-id", namespaceId]);
  if (!output) {
    return null;
  }
  return JSON.parse(output) as WorkerEntitlementRecord;
}

function normalizedRecord(key: string, raw: WorkerEntitlementRecord | null): Required<WorkerEntitlementRecord> | null {
  const userId = raw?.user_id ?? key.replace(/^user:/, "");
  if (!userId || !raw?.status) {
    return null;
  }
  return {
    user_id: userId,
    status: raw.status,
    period_start: raw.period_start ?? null,
    period_end: raw.period_end ?? null,
    plan: raw.plan ?? null,
  };
}

async function upsertEntitlement(client: PoolClient, record: Required<WorkerEntitlementRecord>): Promise<void> {
  await client.query(
    `INSERT INTO mac_entitlements (user_id, status, period_start, period_end, plan, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id) DO UPDATE SET
       status = EXCLUDED.status,
       period_start = EXCLUDED.period_start,
       period_end = EXCLUDED.period_end,
       plan = EXCLUDED.plan,
       updated_at = now()`,
    [record.user_id, record.status, record.period_start, record.period_end, record.plan],
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const keys = listKvKeys(options);
  const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (options.apply && !databaseUrl) {
    throw new Error("POSTGRES_URL or DATABASE_URL is required with --apply");
  }

  const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
  const summary = {
    mode: options.apply ? "apply" : "dry-run",
    namespaceId: options.namespaceId,
    keys: keys.length,
    migrated: 0,
    skippedInvalid: 0,
  };

  try {
    for (const key of keys) {
      const record = normalizedRecord(key.name, readKvJson(options.namespaceId, key.name));
      if (!record) {
        summary.skippedInvalid += 1;
        console.log(JSON.stringify({ action: "skip_invalid", key: key.name }));
        continue;
      }

      if (!options.apply) {
        summary.migrated += 1;
        console.log(
          JSON.stringify({
            action: "would_migrate",
            userId: record.user_id,
            status: record.status,
            periodEnd: record.period_end,
            plan: record.plan,
          }),
        );
        continue;
      }

      const client = await pool!.connect();
      try {
        await upsertEntitlement(client, record);
        summary.migrated += 1;
        console.log(JSON.stringify({ action: "migrated", userId: record.user_id, status: record.status }));
      } finally {
        client.release();
      }
    }
  } finally {
    await pool?.end();
  }

  console.log(JSON.stringify({ action: "summary", ...summary }));
}

main().catch((error: unknown) => {
  console.error("[migrate-worker-kv-entitlements] failed", error);
  process.exit(1);
});
