import { describe, expect, test } from "bun:test";
import { signToken, signaturesMatch, base64UrlEncodeJson, decodeBase64UrlJson } from "@/lib/signedToken";

describe("signToken", () => {
  test("produces a deterministic signature for the same payload and secret", () => {
    expect(signToken("hello", "secret")).toBe(signToken("hello", "secret"));
  });

  test("produces a different signature for a different secret", () => {
    expect(signToken("hello", "secret-a")).not.toBe(signToken("hello", "secret-b"));
  });
});

describe("signaturesMatch", () => {
  test("true for identical strings", () => {
    expect(signaturesMatch("abc", "abc")).toBe(true);
  });

  test("false for different strings, including different lengths", () => {
    expect(signaturesMatch("abc", "abd")).toBe(false);
    expect(signaturesMatch("abc", "abcd")).toBe(false);
  });
});

describe("base64UrlEncodeJson / decodeBase64UrlJson", () => {
  test("round-trips a JSON-serializable value", () => {
    const encoded = base64UrlEncodeJson({ a: 1, b: "two" });
    expect(decodeBase64UrlJson(encoded)).toEqual({ a: 1, b: "two" });
  });

  test("returns null for malformed input rather than throwing", () => {
    expect(decodeBase64UrlJson("not-valid-base64url-json")).toBeNull();
  });
});
