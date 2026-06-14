import { getRepo, getRepoMode } from "@/db";
import { getDatabaseUrl } from "@/db";
import { isDashboardAuthConfigured, isWorkOSDashboardAuthConfigured } from "./dashboardAuth";
import { getDefaultTenantId } from "./session";

export interface ReadinessStatus {
  ok: boolean;
  service: "skilly-web-backend";
  checks: {
    dashboardAuth: {
      configured: boolean;
    };
    database: {
      mode: "memory" | "postgres";
      reachable: boolean;
      seededTenant: boolean;
      errorCode?: DatabaseReadinessErrorCode;
      debug?: {
        host?: string;
        database?: string;
        searchParams?: string[];
        urlLength?: number;
        errorMessage?: string;
      };
    };
  };
}

export type DatabaseReadinessErrorCode =
  | "invalid_connection_string"
  | "connection_failed"
  | "auth_failed"
  | "schema_missing"
  | "unknown";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function classifyDatabaseError(error: unknown): DatabaseReadinessErrorCode {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (code === "42P01" || message.includes("relation") || message.includes("does not exist")) {
    return "schema_missing";
  }
  if (code === "28P01" || message.includes("password authentication failed")) {
    return "auth_failed";
  }
  if (message.includes("invalid url") || message.includes("invalid connection string")) {
    return "invalid_connection_string";
  }
  if (
    code.startsWith("ENOT") ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    message.includes("getaddrinfo") ||
    message.includes("connect")
  ) {
    return "connection_failed";
  }
  return "unknown";
}

export async function getReadinessStatus(): Promise<ReadinessStatus> {
  const authConfigured = isWorkOSDashboardAuthConfigured() || isDashboardAuthConfigured();
  const mode = getRepoMode();
  let databaseReachable = false;
  let seededTenant = false;
  let errorCode: DatabaseReadinessErrorCode | undefined;
  let errorMessage: string | undefined;

  try {
    const tenant = await getRepo().getTenant(getDefaultTenantId());
    databaseReachable = true;
    seededTenant = Boolean(tenant);
  } catch (error) {
    databaseReachable = false;
    seededTenant = false;
    errorCode = classifyDatabaseError(error);
    errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[readiness] database check failed", {
      errorCode,
      code: typeof error === "object" && error && "code" in error ? String(error.code) : undefined,
      name: error instanceof Error ? error.name : undefined,
      message: errorMessage,
    });
  }

  const databaseOk = databaseReachable && seededTenant && (!isProduction() || mode === "postgres");
  const ok = authConfigured && databaseOk;

  return {
    ok,
    service: "skilly-web-backend",
    checks: {
      dashboardAuth: {
        configured: authConfigured,
      },
      database: {
        mode,
        reachable: databaseReachable,
        seededTenant,
        ...(errorCode ? { errorCode } : {}),
        ...(process.env.SKILLY_READINESS_DEBUG === "true"
          ? { debug: databaseDebugInfo(errorMessage) }
          : {}),
      },
    },
  };
}

function databaseDebugInfo(errorMessage: string | undefined): ReadinessStatus["checks"]["database"]["debug"] {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return { errorMessage };
  }

  try {
    const url = new URL(databaseUrl);
    return {
      host: url.host,
      database: url.pathname.replace(/^\//, ""),
      searchParams: [...url.searchParams.keys()].sort(),
      urlLength: databaseUrl.length,
      errorMessage,
    };
  } catch {
    return {
      urlLength: databaseUrl.length,
      errorMessage,
    };
  }
}
