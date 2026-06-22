import { randomUUID } from "node:crypto";
import process from "node:process";
import { Pool, type PoolClient } from "pg";

type DashboardRole = "tenant_admin" | "super_admin";

interface WorkOSUser {
  id: string;
  email?: string | null;
  first_name?: string | null;
  firstName?: string | null;
  last_name?: string | null;
  lastName?: string | null;
  email_verified?: boolean | null;
  created_at?: string | null;
}

interface WorkOSListResponse {
  data?: WorkOSUser[];
  users?: WorkOSUser[];
  list_metadata?: {
    after?: string | null;
    before?: string | null;
  };
  listMetadata?: {
    after?: string | null;
    before?: string | null;
  };
}

interface Options {
  apply: boolean;
  limit: number | null;
  role: DashboardRole;
  capSeconds: number;
  skipUnverified: boolean;
}

const WORKOS_API_BASE = process.env.WORKOS_API_BASE ?? "https://api.workos.com";
const DEFAULT_PAGE_SIZE = 100;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    apply: false,
    limit: null,
    role: "super_admin",
    capSeconds: 0,
    skipUnverified: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg === "--skip-unverified") {
      options.skipUnverified = true;
    } else if (arg === "--limit") {
      options.limit = parsePositiveInt(argv[++index], "--limit");
    } else if (arg === "--role") {
      const role = argv[++index];
      if (role !== "tenant_admin" && role !== "super_admin") {
        throw new Error("--role must be tenant_admin or super_admin");
      }
      options.role = role;
    } else if (arg === "--cap-seconds") {
      options.capSeconds = parsePositiveInt(argv[++index], "--cap-seconds");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parsePositiveInt(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function displayNameFor(user: WorkOSUser): string {
  const firstName = user.first_name ?? user.firstName ?? "";
  const lastName = user.last_name ?? user.lastName ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) {
    return `${fullName} workspace`;
  }
  const emailName = user.email?.split("@")[0]?.trim();
  if (emailName) {
    return `${emailName.charAt(0).toUpperCase()}${emailName.slice(1)} workspace`;
  }
  return `Workspace for ${user.id}`;
}

function usersFromResponse(response: WorkOSListResponse): WorkOSUser[] {
  return response.data ?? response.users ?? [];
}

function nextCursorFromResponse(response: WorkOSListResponse): string | null {
  return response.list_metadata?.after ?? response.listMetadata?.after ?? null;
}

async function listWorkOSUsers(apiKey: string, options: Options): Promise<WorkOSUser[]> {
  const users: WorkOSUser[] = [];
  let after: string | null = null;

  do {
    const url = new URL("/user_management/users", WORKOS_API_BASE);
    url.searchParams.set("limit", String(DEFAULT_PAGE_SIZE));
    if (after) {
      url.searchParams.set("after", after);
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`WorkOS user list failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const payload = (await response.json()) as WorkOSListResponse;
    for (const user of usersFromResponse(payload)) {
      if (options.limit !== null && users.length >= options.limit) {
        return users;
      }
      users.push(user);
    }
    after = nextCursorFromResponse(payload);
  } while (after);

  return users;
}

async function existingMembership(client: PoolClient, workosUserId: string): Promise<string | null> {
  const result = await client.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM dashboard_memberships WHERE workos_user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [workosUserId],
  );
  return result.rows[0]?.tenant_id ?? null;
}

async function migrateUser(client: PoolClient, user: WorkOSUser, options: Options): Promise<{ tenantId: string }> {
  const tenantId = randomUUID();
  await client.query(
    `INSERT INTO tenants (id, name, usage_cap_seconds, allowed_origins, allowed_app_ids)
     VALUES ($1, $2, $3, '{}'::text[], '{}'::text[])`,
    [tenantId, displayNameFor(user), options.capSeconds],
  );
  await client.query(
    `INSERT INTO dashboard_memberships (
       workos_user_id,
       tenant_id,
       role,
       email,
       workos_organization_id
     ) VALUES ($1, $2, $3, $4, NULL)
     ON CONFLICT (workos_user_id, tenant_id) DO UPDATE SET
       role = EXCLUDED.role,
       email = EXCLUDED.email,
       workos_organization_id = EXCLUDED.workos_organization_id`,
    [user.id, tenantId, options.role, user.email ?? null],
  );
  return { tenantId };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const workosApiKey = requireEnv("WORKOS_API_KEY");
  const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("POSTGRES_URL or DATABASE_URL is required");
  }

  const users = await listWorkOSUsers(workosApiKey, options);
  const pool = new Pool({ connectionString: databaseUrl });
  const summary = {
    mode: options.apply ? "apply" : "dry-run",
    fetched: users.length,
    created: 0,
    skippedExisting: 0,
    skippedInvalid: 0,
    skippedUnverified: 0,
    errors: 0,
  };

  try {
    for (const user of users) {
      if (!user.id) {
        summary.skippedInvalid += 1;
        continue;
      }
      if (options.skipUnverified && user.email_verified === false) {
        summary.skippedUnverified += 1;
        continue;
      }

      const client = await pool.connect();
      try {
        const existingTenantId = await existingMembership(client, user.id);
        if (existingTenantId) {
          summary.skippedExisting += 1;
          console.log(JSON.stringify({ action: "skip_existing", workosUserId: user.id, tenantId: existingTenantId }));
          continue;
        }

        if (!options.apply) {
          summary.created += 1;
          console.log(
            JSON.stringify({
              action: "would_create",
              workosUserId: user.id,
              email: user.email ?? null,
              tenantName: displayNameFor(user),
              role: options.role,
              usageCapSeconds: options.capSeconds,
            }),
          );
          continue;
        }

        await client.query("BEGIN");
        const result = await migrateUser(client, user, options);
        await client.query("COMMIT");
        summary.created += 1;
        console.log(
          JSON.stringify({
            action: "created",
            workosUserId: user.id,
            email: user.email ?? null,
            tenantId: result.tenantId,
            role: options.role,
          }),
        );
      } catch (error) {
        if (options.apply) {
          await client.query("ROLLBACK").catch(() => {});
        }
        summary.errors += 1;
        console.error(
          JSON.stringify({
            action: "error",
            workosUserId: user.id,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }

  console.log(JSON.stringify({ summary }));
  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
