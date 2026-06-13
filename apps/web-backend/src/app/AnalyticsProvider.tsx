"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

function getDistinctId(): string {
  const key = "skilly_web_distinct_id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const generated = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, generated);
  return generated;
}

function cleanProperties(properties: AnalyticsProperties): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined),
  );
}

export function trackClientEvent(event: string, properties: AnalyticsProperties = {}): void {
  if (typeof window === "undefined") {
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

  window.gtag?.("event", event, cleaned);
}

export function AnalyticsProvider({
  children,
  tenantId,
  tenantName,
  roleSurface = "tenant_admin",
}: {
  children: ReactNode;
  tenantId?: string;
  tenantName?: string;
  roleSurface?: "tenant_admin" | "super_admin" | "public";
}) {
  const pathname = usePathname();
  const baseProperties = useMemo(
    () => ({
      tenant_id: tenantId,
      tenant_name: tenantName,
      role_surface: pathname.startsWith("/dashboard/admin") ? "super_admin" : roleSurface,
    }),
    [pathname, roleSurface, tenantId, tenantName],
  );

  useEffect(() => {
    const url = `${window.location.pathname}${window.location.search}`;
    window.gtag?.("event", "page_view", {
      page_path: url,
      page_location: window.location.href,
      page_title: document.title,
      ...baseProperties,
    });
    trackClientEvent("dashboard_page_viewed", {
      ...baseProperties,
      page_path: url,
      page_title: document.title,
    });
  }, [baseProperties, pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest<HTMLElement>("[data-analytics-event]");
      if (!element) {
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
  }, [baseProperties]);

  return children;
}
