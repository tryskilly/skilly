import { describe, expect, test } from "bun:test";
import { generateKey, hashKey, isValidKeyFormat, keyDisplay, keyType } from "../src/domain/keys";
import { matchOrigin, normalizeOrigin } from "../src/domain/origin";
import { isOverQuota, remainingSeconds } from "../src/domain/quota";

describe("keys", () => {
  test("validates well-formed pk_/sk_ keys and rejects junk", () => {
    // Secret sample built by concatenation so the source contains no
    // Stripe-shaped `sk_<env>_<24+ chars>` literal (trips secret scanners).
    const secretSample = "sk_" + "test_" + "abcdefghijklmnopqrstuvwx";
    expect(isValidKeyFormat("pk_live_abcdefghijklmnopqrstuvwx")).toBe(true);
    expect(isValidKeyFormat(secretSample)).toBe(true);
    expect(isValidKeyFormat("pk_live_short")).toBe(false);
    expect(isValidKeyFormat("nope")).toBe(false);
  });

  test("classifies and hashes deterministically", () => {
    expect(keyType("pk_live_x")).toBe("publishable");
    expect(keyType("sk_live_x")).toBe("secret");
    expect(keyType("zz_x")).toBeNull();
    expect(hashKey("pk_live_abc")).toBe(hashKey("pk_live_abc"));
    expect(hashKey("pk_live_abc")).not.toBe(hashKey("pk_live_abd"));
  });

  test("display fields and generated keys", () => {
    expect(keyDisplay("pk_live_abcd1234").prefix).toBe("pk_live");
    expect(keyDisplay("pk_live_abcd1234").last4).toBe("1234");
    const generated = generateKey("publishable");
    expect(isValidKeyFormat(generated)).toBe(true);
    expect(keyType(generated)).toBe("publishable");
  });
});

describe("origin allowlist", () => {
  test("normalizes origins", () => {
    expect(normalizeOrigin("https://Acme.com/path")).toBe("https://acme.com");
    expect(normalizeOrigin("not a url")).toBeNull();
  });

  test("exact match", () => {
    expect(matchOrigin("https://acme.com", ["https://acme.com"])).toBe(true);
    expect(matchOrigin("https://evil.com", ["https://acme.com"])).toBe(false);
    expect(matchOrigin("https://acme.com", [])).toBe(false);
  });

  test("wildcard subdomain match, but not the apex or other domains", () => {
    const allow = ["https://*.acme.com"];
    expect(matchOrigin("https://app.acme.com", allow)).toBe(true);
    expect(matchOrigin("https://deep.app.acme.com", allow)).toBe(true);
    expect(matchOrigin("https://acme.com", allow)).toBe(false);
    expect(matchOrigin("https://acme.com.evil.com", allow)).toBe(false);
    expect(matchOrigin("http://app.acme.com", allow)).toBe(false); // scheme mismatch
  });
});

describe("quota", () => {
  test("unlimited cap never blocks", () => {
    expect(isOverQuota({ usageSecondsThisPeriod: 1e9, capSeconds: 0 })).toBe(false);
    expect(remainingSeconds({ usageSecondsThisPeriod: 5, capSeconds: 0 })).toBe(Number.POSITIVE_INFINITY);
  });

  test("blocks at or above the cap", () => {
    expect(isOverQuota({ usageSecondsThisPeriod: 100, capSeconds: 100 })).toBe(true);
    expect(isOverQuota({ usageSecondsThisPeriod: 99, capSeconds: 100 })).toBe(false);
    expect(remainingSeconds({ usageSecondsThisPeriod: 60, capSeconds: 100 })).toBe(40);
  });
});
