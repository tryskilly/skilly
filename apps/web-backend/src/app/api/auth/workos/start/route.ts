import { NextResponse, type NextRequest } from "next/server";
import {
  buildWorkOSAuthorizeUrl,
  createWorkOSState,
  isWorkOSAuthConfigured,
  safeDashboardNextPath,
  WORKOS_STATE_COOKIE,
} from "@/lib/workosAuth";
import { publicUrl } from "@/lib/requestOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const nextPath = safeDashboardNextPath(request.nextUrl.searchParams.get("next"));
  if (!isWorkOSAuthConfigured()) {
    const url = publicUrl(request, "/login");
    url.searchParams.set("next", nextPath);
    url.searchParams.set("error", "workos_unconfigured");
    return NextResponse.redirect(url, { status: 303 });
  }

  const { state, cookieValue, maxAge } = createWorkOSState(nextPath);
  const response = NextResponse.redirect(buildWorkOSAuthorizeUrl(state), { status: 303 });

  response.cookies.set(WORKOS_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge,
  });

  return response;
}
