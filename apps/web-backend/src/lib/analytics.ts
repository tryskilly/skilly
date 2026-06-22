import { shouldSuppressServerAnalytics } from "./analyticsPolicy";

type AnalyticsValue = string | number | boolean | null | undefined;

export type AnalyticsProperties = Record<string, AnalyticsValue>;

const POSTHOG_HOST = process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const POSTHOG_KEY = process.env.POSTHOG_PROJECT_API_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID ?? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GA_API_SECRET = process.env.GA_API_SECRET;
const ANALYTICS_TIMEOUT_MS = 1500;

function cleanProperties(properties: AnalyticsProperties): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined),
  );
}

function providerSafeProperties(
  properties: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => {
      const normalized = key.toLowerCase();
      return !normalized.includes("email") && !normalized.includes("phone");
    }),
  );
}

export async function captureServerEvent(
  event: string,
  properties: AnalyticsProperties = {},
  distinctId = properties.tenant_id ?? "skilly_web_backend",
): Promise<void> {
  if (shouldSuppressServerAnalytics(properties)) {
    return;
  }

  const cleaned = providerSafeProperties({
    ...cleanProperties(properties),
    source_surface: properties.source_surface ?? "web_backend",
  });

  await Promise.allSettled([
    capturePostHogEvent(event, cleaned, String(distinctId)),
    captureGaEvent(event, cleaned, String(distinctId)),
  ]);
}

async function capturePostHogEvent(
  event: string,
  properties: Record<string, string | number | boolean | null>,
  distinctId: string,
): Promise<void> {
  if (!POSTHOG_KEY) {
    return;
  }
  await fetch(`${POSTHOG_HOST.replace(/\/$/, "")}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(ANALYTICS_TIMEOUT_MS),
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      properties: {
        ...properties,
        distinct_id: distinctId,
      },
    }),
  }).catch(() => undefined);
}

async function captureGaEvent(
  event: string,
  properties: Record<string, string | number | boolean | null>,
  clientId: string,
): Promise<void> {
  if (!GA_MEASUREMENT_ID || !GA_API_SECRET) {
    return;
  }
  await fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
      GA_MEASUREMENT_ID,
    )}&api_secret=${encodeURIComponent(GA_API_SECRET)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(ANALYTICS_TIMEOUT_MS),
      body: JSON.stringify({
        client_id: clientId,
        events: [
          {
            name: event,
            params: properties,
          },
        ],
      }),
    },
  ).catch(() => undefined);
}
