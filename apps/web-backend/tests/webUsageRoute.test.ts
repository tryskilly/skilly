import { afterEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { MemoryRepo, DEMO_PUBLISHABLE_KEY, defaultSeed } from "../src/db/memoryRepo";
import { POST } from "../src/app/api/web/usage/route";

const ALLOWED_ORIGIN = "http://localhost:4399";

function usageRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:4310/api/web/usage", {
    method: "POST",
    headers: {
      "X-Skilly-Key": DEMO_PUBLISHABLE_KEY,
      Origin: ALLOWED_ORIGIN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("/api/web/usage action metering", () => {
  afterEach(() => {
    globalThis.__skillyRepo = undefined;
  });

  test("records one action usage row with count and carries page/domain", async () => {
    const repo = new MemoryRepo();
    globalThis.__skillyRepo = repo;
    const response = await POST(
      usageRequest({
        seconds: 42,
        actionsExecuted: 150,
        actionsRefused: 3,
        page: "/projects",
        domain: "app.acme.com",
      }),
    );

    expect(response.status).toBe(200);
    const events = await repo.listUsageEvents(defaultSeed().tenants[0]!.id, 10);
    const actionEvent = events.find((event) => event.kind === "action");
    expect(actionEvent).toMatchObject({
      kind: "action",
      seconds: 0,
      count: 100,
    });
    const rawUsage = (repo as unknown as { usage: Array<{ kind: string; page: string | null; domain: string | null }> })
      .usage;
    expect(rawUsage.find((event) => event.kind === "action")).toMatchObject({
      page: "/projects",
      domain: "app.acme.com",
    });
    expect(events.find((event) => event.kind === "session_seconds")?.seconds).toBe(42);
  });

  test("ignores invalid action counts without recording an action row", async () => {
    const repo = new MemoryRepo();
    globalThis.__skillyRepo = repo;
    const response = await POST(
      usageRequest({
        seconds: 1,
        actionsExecuted: "3",
        actionsRefused: Number.NaN,
      }),
    );

    expect(response.status).toBe(200);
    const events = await repo.listUsageEvents(defaultSeed().tenants[0]!.id, 10);
    expect(events.some((event) => event.kind === "action")).toBe(false);
  });
});
