import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

interface Options {
  namespaceId: string;
  limit: number | null;
  prefix: string;
  userId: string | null;
}

interface KvKey {
  name: string;
}

interface EntitlementRecord {
  user_id: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  plan: string | null;
}

interface WorkerEntitlementRecord {
  user_id?: string;
  status?: string;
  period_start?: string | null;
  period_end?: string | null;
  plan?: string | null;
}

type Diff = "status" | "period_start" | "period_end" | "plan";

const DEFAULT_NAMESPACE_ID = "d05cca70637d4355b982da6e0a15a1fa";
const WORKER_DIR = process.env.SKILLY_WORKER_DIR ?? fileURLToPath(new URL("../../../worker", import.meta.url));

function parseArgs(argv: string[]): Options {
  const options: Options = {
    namespaceId: process.env.SKILLY_WORKER_KV_NAMESPACE_ID ?? DEFAULT_NAMESPACE_ID,
    limit: null,
    prefix: "user:",
    userId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--namespace-id") {
      options.namespaceId = requiredValue(argv[++index], "--namespace-id");
    } else if (arg === "--prefix") {
      options.prefix = requiredValue(argv[++index], "--prefix");
    } else if (arg === "--limit") {
      options.limit = parseNonNegativeInt(requiredValue(argv[++index], "--limit"), "--limit");
    } else if (arg === "--user-id") {
      options.userId = requiredValue(argv[++index], "--user-id");
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

function runWrangler(args: string[]): string {
  const result = spawnSync("npm", ["exec", "--", "wrangler", ...args], {
    cwd: WORKER_DIR,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`wrangler ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function listKvKeys(options: Options): KvKey[] {
  if (options.userId) {
    return [{ name: `${options.prefix}${options.userId}` }];
  }
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

function readKvJson(namespaceId: string, key: string): EntitlementRecord | null {
  const output = runWrangler(["kv", "key", "get", key, "--namespace-id", namespaceId]);
  if (!output) {
    return null;
  }
  const raw = JSON.parse(output) as WorkerEntitlementRecord;
  const userId = raw.user_id ?? key.replace(/^user:/, "");
  if (!userId || !raw.status) {
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

async function readStudioEntitlement(pool: Pool, userId: string): Promise<EntitlementRecord | null> {
  const result = await pool.query<EntitlementRecord>(
    `SELECT user_id, status, period_start, period_end, plan
       FROM mac_entitlements
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

function diffRecords(worker: EntitlementRecord, studio: EntitlementRecord): Diff[] {
  const diffs: Diff[] = [];
  for (const field of ["status", "period_start", "period_end", "plan"] as const) {
    if (worker[field] !== studio[field]) {
      diffs.push(field);
    }
  }
  return diffs;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const keys = listKvKeys(options);
  const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!databaseUrl && keys.length > 0) {
    throw new Error("POSTGRES_URL or DATABASE_URL is required");
  }

  const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
  const summary = {
    namespaceId: options.namespaceId,
    checked: 0,
    matches: 0,
    mismatches: 0,
    missingInStudio: 0,
    missingInWorker: 0,
    skippedInvalid: 0,
  };

  try {
    for (const key of keys) {
      const workerRecord = readKvJson(options.namespaceId, key.name);
      if (!workerRecord) {
        summary.missingInWorker += options.userId ? 1 : 0;
        summary.skippedInvalid += options.userId ? 0 : 1;
        console.log(JSON.stringify({ action: options.userId ? "missing_in_worker" : "skip_invalid", key: key.name }));
        continue;
      }

      const studioRecord = await readStudioEntitlement(pool!, workerRecord.user_id);
      summary.checked += 1;
      if (!studioRecord) {
        summary.missingInStudio += 1;
        console.log(JSON.stringify({ action: "missing_in_studio", userId: workerRecord.user_id }));
        continue;
      }

      const diffs = diffRecords(workerRecord, studioRecord);
      if (diffs.length > 0) {
        summary.mismatches += 1;
        console.log(JSON.stringify({ action: "mismatch", userId: workerRecord.user_id, fields: diffs }));
        continue;
      }

      summary.matches += 1;
      console.log(JSON.stringify({ action: "match", userId: workerRecord.user_id, status: workerRecord.status }));
    }
  } finally {
    await pool?.end();
  }

  console.log(JSON.stringify({ action: "summary", ...summary }));
}

main().catch((error: unknown) => {
  console.error("[check-mac-entitlement-parity] failed", error);
  process.exit(1);
});
