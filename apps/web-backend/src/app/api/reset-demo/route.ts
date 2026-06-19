import { NextResponse } from "next/server";
import { MemoryRepo } from "@/db/memoryRepo";

export const dynamic = "force-dynamic";

/**
 * Test-only reset endpoint. Re-seeds the in-memory demo tenant so E2E tests
 * start from a known state. Disabled in production (and irrelevant when a real
 * Postgres URL is configured because we never reach the in-memory branch).
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }
  globalThis.__skillyRepo = new MemoryRepo();
  return NextResponse.json({ ok: true });
}
