import { afterEach, describe, expect, test } from "bun:test";
import {
  isAnalyticsEnvironmentSuppressed,
  isBrowserAnalyticsHostSuppressed,
  isInternalAnalyticsEmail,
  shouldSuppressServerAnalytics,
} from "../src/lib/analyticsPolicy";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("analytics policy", () => {
  test("suppresses local and preview environments by default", () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    expect(isAnalyticsEnvironmentSuppressed()).toBe(true);

    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.NETLIFY = "true";
    process.env.CONTEXT = "deploy-preview";
    expect(isAnalyticsEnvironmentSuppressed()).toBe(true);
  });

  test("allows production unless explicitly disabled", () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.NETLIFY;
    delete process.env.CONTEXT;
    delete process.env.VERCEL_ENV;

    expect(isAnalyticsEnvironmentSuppressed()).toBe(false);

    process.env.ANALYTICS_DISABLED = "true";
    expect(isAnalyticsEnvironmentSuppressed()).toBe(true);
  });

  test("recognizes internal dashboard accounts", () => {
    expect(isInternalAnalyticsEmail("eng.mohamedszaied@gmail.com")).toBe(true);

    process.env.ANALYTICS_EXCLUDED_EMAILS = "founder@example.com";
    expect(isInternalAnalyticsEmail("Founder@Example.com")).toBe(true);
    expect(isInternalAnalyticsEmail("customer@example.com")).toBe(false);
  });

  test("suppresses server analytics for internal accounts and explicit flags", () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.NETLIFY;
    delete process.env.CONTEXT;
    delete process.env.VERCEL_ENV;

    expect(shouldSuppressServerAnalytics({ account_email: "eng.mohamedszaied@gmail.com" })).toBe(true);
    expect(shouldSuppressServerAnalytics({ analytics_suppressed: true })).toBe(true);
    expect(shouldSuppressServerAnalytics({ tenant_id: "tenant_customer" })).toBe(false);
  });

  test("suppresses browser analytics on local and preview hosts", () => {
    expect(isBrowserAnalyticsHostSuppressed("localhost")).toBe(true);
    expect(isBrowserAnalyticsHostSuppressed("studio--preview.netlify.app")).toBe(true);
    expect(isBrowserAnalyticsHostSuppressed("studio.tryskilly.app")).toBe(false);
  });
});
