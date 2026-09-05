import { NextResponse, type NextRequest } from "next/server";
import { DesktopAuthUpstreamError, exchangeDesktopCode, refreshDesktopSession } from "@/lib/desktopAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed: unknown = await request.json().catch(() => null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;
  if (body.grant_type !== undefined && body.grant_type !== "refresh_token" && body.grant_type !== "authorization_code") {
    return NextResponse.json({ error: "unsupported grant type" }, { status: 400 });
  }
  const grantType = body.grant_type === "refresh_token" ? "refresh_token" : "authorization_code";
  const credential = grantType === "refresh_token" ? body.refresh_token : body.code;
  if (typeof credential !== "string" || credential.length < 8 || credential.length > 4096) {
    return NextResponse.json({ error: grantType === "refresh_token" ? "missing refresh token" : "missing code" }, { status: 400 });
  }
  try {
    const result = grantType === "refresh_token" ? await refreshDesktopSession(credential) : await exchangeDesktopCode(credential);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DesktopAuthUpstreamError) return NextResponse.json({ error: "authentication failed" }, { status: error.status >= 500 ? 502 : 401 });
    return NextResponse.json({ error: "authentication unavailable" }, { status: 503 });
  }
}
