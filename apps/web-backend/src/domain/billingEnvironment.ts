type BillingEnv = Record<string, string | undefined>;

export type BillingSurface = "personal" | "builder" | "portal" | "byok" | "webhook";

export interface BillingEnvironmentInput {
  env?: BillingEnv;
  surface: BillingSurface;
  host?: string | null;
  productId?: string | null;
}

export interface BillingEnvironmentResult {
  ok: boolean;
  error?: string;
  mode: "production" | "sandbox";
  apiBase: string;
}

const PRODUCTION_BASE = "https://api.polar.sh";
const SANDBOX_BASE = "https://sandbox-api.polar.sh";

function nonempty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isKnownProductionHost(host: string | null | undefined): boolean {
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  return hostname === "tryskilly.app" || hostname.endsWith(".tryskilly.app");
}

/** Fail-closed guard preventing Polar/database cross-wiring between environments. */
export function validateBillingEnvironment(input: BillingEnvironmentInput): BillingEnvironmentResult {
  const env = input.env ?? process.env;
  const requestedMode = env.SKILLY_BILLING_MODE;
  if (requestedMode && requestedMode !== "sandbox" && requestedMode !== "production") {
    return { ok: false, error: "invalid billing mode", mode: "production", apiBase: env.POLAR_API_BASE ?? PRODUCTION_BASE };
  }

  const mode = requestedMode === "sandbox" ? "sandbox" : "production";
  const apiBase = (env.POLAR_API_BASE ?? PRODUCTION_BASE).replace(/\/$/, "");
  const databaseUrl = env.POSTGRES_URL ?? env.DATABASE_URL;

  if (isKnownProductionHost(input.host) && (mode === "sandbox" || apiBase === SANDBOX_BASE || nonempty(env.SKILLY_DATABASE_URL_MARKER))) {
    return { ok: false, error: "sandbox billing configuration is not allowed on production host", mode, apiBase };
  }
  if (mode === "sandbox") {
    if (env.VERCEL_ENV !== "preview" || apiBase !== SANDBOX_BASE || env.SKILLY_DATABASE_ENV !== "sandbox") {
      return { ok: false, error: "sandbox billing requires preview, sandbox Polar, and sandbox database", mode, apiBase };
    }
    if (!nonempty(databaseUrl) || !nonempty(env.SKILLY_DATABASE_URL_MARKER)) {
      return { ok: false, error: "sandbox billing requires a separate database URL marker", mode, apiBase };
    }
    if (!nonempty(env.POLAR_ACCESS_TOKEN) || !nonempty(env.POLAR_WEBHOOK_SECRET) || !nonempty(env.POLAR_MAC_PRODUCT_ID) || !nonempty(env.POLAR_BUILDER_STARTER_PRODUCT_ID)) {
      return { ok: false, error: "sandbox billing requires isolated Polar credentials and products", mode, apiBase };
    }
  } else {
    if (apiBase === SANDBOX_BASE || env.SKILLY_DATABASE_ENV === "sandbox" || nonempty(env.SKILLY_DATABASE_URL_MARKER)) {
      return { ok: false, error: "production billing cannot use sandbox Polar or database markers", mode, apiBase };
    }
  }

  if (input.surface === "webhook") {
    if (!nonempty(env.POLAR_WEBHOOK_SECRET)) return { ok: false, error: "webhook secret is not configured", mode, apiBase };
    return { ok: true, mode, apiBase };
  }
  if (!nonempty(env.POLAR_ACCESS_TOKEN)) return { ok: false, error: "billing access token is not configured", mode, apiBase };
  if ((input.surface === "personal" || input.surface === "builder" || input.surface === "byok") && !nonempty(input.productId ?? undefined)) {
    return { ok: false, error: "billing product is not configured", mode, apiBase };
  }
  return { ok: true, mode, apiBase };
}
