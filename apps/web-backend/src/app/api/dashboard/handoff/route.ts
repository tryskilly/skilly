import { NextResponse } from "next/server";
import { getRepo } from "@/db";
import { applySignupHandoff } from "@/lib/signupHandoffServer";
import type { SignupHandoff } from "@/lib/signupHandoff";
import { getDashboardSession } from "@/lib/dashboardAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return origin === `${protocol}://${host}`;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "cross-origin request" }, { status: 403 });
  const session = await getDashboardSession();
  if (!session) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Partial<SignupHandoff> | null;
  const result = await applySignupHandoff(getRepo(), session.tenantId, body ?? {});
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, issues: result.issues, message: result.status === 409 ? "This project already has a skill. Review it before replacing anything." : undefined },
      { status: result.status },
    );
  }
  return NextResponse.json(result);
}
