"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { isBrowserAnalyticsHostSuppressed } from "@/lib/analyticsPolicy";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __SKILLY_ANALYTICS_SUPPRESSED__?: boolean;
  }
}

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

// Module-level identity state so all trackClientEvent() calls share one distinct_id.
let _resolvedDistinctId: string | null = null;

function getAnonymousDistinctId(): string {
  const key = "skilly_web_distinct_id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const generated = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, generated);
  return generated;
}

function getDistinctId(): string {
  return _resolvedDistinctId ?? getAnonymousDistinctId();
}

function deriveFunnelStage(pathname: string): string {
  if (pathname.startsWith("/dashboard/billing") || pathname.startsWith("/dashboard/people/account")) {
    return "conversion";
  }
  return "activation";
}

function cleanProperties(properties: AnalyticsProperties): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined),
  );
}

function gaSafeProperties(properties: Record<string, string | number | boolean | null>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => {
      const normalized = key.toLowerCase();
      return !key.startsWith("$") && !normalized.includes("email") && !normalized.includes("name") && !normalized.includes("phone");
    }),
  );
}

function browserAnalyticsSuppressed(): boolean {
  return isBrowserAnalyticsHostSuppressed(window.location.hostname) || window.__SKILLY_ANALYTICS_SUPPRESSED__ === true;
}

export function trackClientEvent(event: string, properties: AnalyticsProperties = {}): void {
  if (typeof window === "undefined") {
    return;
  }
  if (browserAnalyticsSuppressed()) {
    return;
  }
  const cleaned = cleanProperties({
    ...properties,
    source_surface: properties.source_surface ?? "web_dashboard",
  });
  const distinctId = getDistinctId();

  if (POSTHOG_KEY) {
    void fetch(`${POSTHOG_HOST.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        properties: {
          ...cleaned,
          distinct_id: distinctId,
        },
      }),
    }).catch(() => undefined);
  }

  window.gtag?.("event", event, gaSafeProperties(cleaned));
}

export function AnalyticsProvider({
  children,
  tenantId,
  roleSurface = "tenant_admin",
  analyticsSuppressed = false,
  workosUserId,
}: {
  children: ReactNode;
  tenantId?: string;
  roleSurface?: "tenant_admin" | "super_admin" | "public";
  analyticsSuppressed?: boolean;
  workosUserId?: string;
}) {
  const pathname = usePathname();
  const baseProperties = useMemo(
    () => ({
      tenant_id: tenantId,
      role_surface: pathname.startsWith("/dashboard/admin") ? "super_admin" : roleSurface,
      product_line: pathname.startsWith("/dashboard/people") ? "people" : "builders",
      funnel_stage: deriveFunnelStage(pathname),
    }),
    [pathname, roleSurface, tenantId],
  );

  useEffect(() => {
    window.__SKILLY_ANALYTICS_SUPPRESSED__ = analyticsSuppressed;
  }, [analyticsSuppressed]);

  // Identity stitching: link the anonymous browser ID from the marketing site
  // to the WorkOS user so the full marketing → signup → dashboard funnel is
  // visible as one user profile in PostHog.
  useEffect(() => {
    if (!workosUserId || analyticsSuppressed || browserAnalyticsSuppressed() || !POSTHOG_KEY) {
      return;
    }
    const anonId = getAnonymousDistinctId();
    _resolvedDistinctId = workosUserId;
    void fetch(`${POSTHOG_HOST.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: "$identify",
        properties: {
          distinct_id: workosUserId,
          $anon_distinct_id: anonId,
        },
      }),
    }).catch(() => undefined);
  }, [workosUserId, analyticsSuppressed]);

  useEffect(() => {
    if (analyticsSuppressed || browserAnalyticsSuppressed()) {
      return;
    }
    const url = `${window.location.pathname}${window.location.search}`;
    window.gtag?.("event", "page_view", {
      page_path: url,
      page_location: window.location.href,
      page_title: document.title,
      ...gaSafeProperties(cleanProperties(baseProperties)),
    });
    trackClientEvent("dashboard_page_viewed", {
      ...baseProperties,
      page_path: url,
      page_title: document.title,
    });
  }, [analyticsSuppressed, baseProperties, pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest<HTMLElement>("[data-analytics-event]");
      if (!element) {
        return;
      }
      if (analyticsSuppressed || browserAnalyticsSuppressed()) {
        return;
      }
      trackClientEvent(element.dataset.analyticsEvent ?? "dashboard_action_clicked", {
        ...baseProperties,
        page_path: window.location.pathname,
        action_label: element.dataset.analyticsLabel ?? element.textContent?.trim().slice(0, 80),
        action_target: element.dataset.analyticsTarget,
      });
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [analyticsSuppressed, baseProperties]);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__SKILLY_ANALYTICS_SUPPRESSED__=${analyticsSuppressed ? "true" : "false"};`,
        }}
      />
      {children}
    </>
  );
}
