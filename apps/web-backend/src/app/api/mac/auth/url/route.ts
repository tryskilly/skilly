import { NextResponse, type NextRequest } from "next/server";
import { buildDesktopAuthorizeUrl, isValidDesktopOAuthState } from "@/lib/desktopAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest): NextResponse {
  const requestURL = request.nextUrl ?? new URL(request.url);
  const state = requestURL.searchParams.get("state");
  if (!isValidDesktopOAuthState(state)) return NextResponse.json({ error: "invalid state" }, { status: 400 });
  try {
    return NextResponse.json({ url: buildDesktopAuthorizeUrl(state, requestURL.origin) });
  } catch {
    return NextResponse.json({ error: "authentication unavailable" }, { status: 503 });
  }
}
