import { describe, expect, test } from "bun:test";
import { BackendError, fetchSessionToken, fetchTenantSkill } from "../src/token";

const BACKEND = "http://localhost:4310";
const KEY = "pk_test_demo";

describe("fetchSessionToken", () => {
  test("parses a successful token response", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ clientSecret: "ek_abc", model: "gpt-realtime", expiresAt: 123 }), { status: 200 });
    const token = await fetchSessionToken({ backendUrl: BACKEND, publishableKey: KEY, fetchImpl: fetchImpl as typeof fetch });
    expect(token.clientSecret).toBe("ek_abc");
    expect(token.model).toBe("gpt-realtime");
  });

  test("throws BackendError with the status on failure", async () => {
    const fetchImpl = async () => new Response("nope", { status: 403 });
    await expect(
      fetchSessionToken({ backendUrl: BACKEND, publishableKey: KEY, fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toMatchObject({ name: "BackendError", status: 403 });
  });

  test("rejects when clientSecret is missing", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ model: "x" }), { status: 200 });
    await expect(
      fetchSessionToken({ backendUrl: BACKEND, publishableKey: KEY, fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toBeInstanceOf(BackendError);
  });
});

describe("fetchTenantSkill", () => {
  test("returns content on 200", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ content: "# Skill" }), { status: 200 });
    const content = await fetchTenantSkill({
      backendUrl: BACKEND,
      publishableKey: KEY,
      skillId: "acme",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(content).toBe("# Skill");
  });

  test("returns null on 404", async () => {
    const fetchImpl = async () => new Response("missing", { status: 404 });
    const content = await fetchTenantSkill({
      backendUrl: BACKEND,
      publishableKey: KEY,
      skillId: "absent",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(content).toBeNull();
  });
});
