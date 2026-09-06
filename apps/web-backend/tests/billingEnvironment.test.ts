import { describe, expect, test } from "bun:test";
import { validateBillingEnvironment } from "../src/domain/billingEnvironment";

const base = {
  POLAR_ACCESS_TOKEN: "token",
  POLAR_MAC_PRODUCT_ID: "mac-19",
  POLAR_BUILDER_STARTER_PRODUCT_ID: "starter",
  POLAR_WEBHOOK_SECRET: "secret",
  DATABASE_URL: "db",
};

describe("billing environment guard", () => {
  test("allows a fully wired sandbox and preserves sandbox base", () => {
    const result = validateBillingEnvironment({
      env: { ...base, SKILLY_BILLING_MODE: "sandbox", VERCEL_ENV: "preview", POLAR_API_BASE: "https://sandbox-api.polar.sh", SKILLY_DATABASE_ENV: "sandbox", SKILLY_DATABASE_URL_MARKER: "preview-db" },
      surface: "personal",
      productId: base.POLAR_MAC_PRODUCT_ID,
    });
    expect(result).toMatchObject({ ok: true, mode: "sandbox", apiBase: "https://sandbox-api.polar.sh" });
  });

  test("rejects sandbox on production host and production mode pointed at sandbox", () => {
    expect(validateBillingEnvironment({ env: { ...base, SKILLY_BILLING_MODE: "sandbox", VERCEL_ENV: "preview", POLAR_API_BASE: "https://sandbox-api.polar.sh", SKILLY_DATABASE_ENV: "sandbox", SKILLY_DATABASE_URL_MARKER: "x" }, surface: "personal", productId: "mac-19", host: "tryskilly.app" }).ok).toBe(false);
    expect(validateBillingEnvironment({ env: { ...base, SKILLY_BILLING_MODE: "production", POLAR_API_BASE: "https://sandbox-api.polar.sh" }, surface: "portal" }).ok).toBe(false);
  });

  test("fails closed when sandbox requirements or route variables are missing", () => {
    expect(validateBillingEnvironment({ env: { ...base, SKILLY_BILLING_MODE: "sandbox", VERCEL_ENV: "preview", POLAR_API_BASE: "https://sandbox-api.polar.sh", SKILLY_DATABASE_ENV: "sandbox" }, surface: "personal", productId: "mac-19" }).ok).toBe(false);
    expect(validateBillingEnvironment({ env: { ...base, POLAR_ACCESS_TOKEN: "" }, surface: "portal" }).ok).toBe(false);
    expect(validateBillingEnvironment({ env: base, surface: "builder", productId: "" }).ok).toBe(false);
  });

  test("allows configured Builder Starter and routes use the same sandbox base", () => {
    const result = validateBillingEnvironment({ env: { ...base, SKILLY_BILLING_MODE: "sandbox", VERCEL_ENV: "preview", POLAR_API_BASE: "https://sandbox-api.polar.sh", SKILLY_DATABASE_ENV: "sandbox", SKILLY_DATABASE_URL_MARKER: "builder-preview" }, surface: "builder", productId: base.POLAR_BUILDER_STARTER_PRODUCT_ID });
    expect(result.ok).toBe(true);
    expect(result.apiBase).toBe("https://sandbox-api.polar.sh");
  });
});
