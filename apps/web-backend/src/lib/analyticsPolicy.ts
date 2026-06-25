type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const DEFAULT_EXCLUDED_EMAILS = ["eng.mohamedszaied@gmail.com"];

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function truthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

export function isInternalAnalyticsEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  const normalized = email.trim().toLowerCase();
  const excluded = new Set([...DEFAULT_EXCLUDED_EMAILS, ...parseList(process.env.ANALYTICS_EXCLUDED_EMAILS)]);
  return excluded.has(normalized);
}

export function isAnalyticsEnvironmentSuppressed(): boolean {
  if (truthy(process.env.ANALYTICS_FORCE_ENABLE)) {
    return false;
  }
  if (truthy(process.env.ANALYTICS_DISABLED)) {
    return true;
  }
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  if (process.env.NETLIFY === "true" && process.env.CONTEXT && process.env.CONTEXT !== "production") {
    return true;
  }
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return true;
  }
  return false;
}

export function isBrowserAnalyticsHostSuppressed(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".netlify.app") ||
    host.endsWith(".netlify.live") ||
    host.endsWith(".vercel.app")
  );
}

export function shouldSuppressServerAnalytics(properties: AnalyticsProperties = {}): boolean {
  if (isAnalyticsEnvironmentSuppressed()) {
    return true;
  }
  if (properties.analytics_suppressed === true || properties.internal_traffic === true) {
    return true;
  }
  const email = properties.account_email ?? properties.email ?? properties.user_email;
  return typeof email === "string" && isInternalAnalyticsEmail(email);
}
