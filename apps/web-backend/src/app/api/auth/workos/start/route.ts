import { NextResponse, type NextRequest } from "next/server";
import {
  buildWorkOSAuthorizeUrl,
  createWorkOSState,
  isWorkOSAuthConfigured,
  parseWorkOSAuthMethod,
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
  const method = parseWorkOSAuthMethod(request.nextUrl.searchParams.get("method"));
  // intent=signup routes brand-new WorkOS users through self-serve tenant creation
  // (see the callback). Default is "signin".
  const intent = request.nextUrl.searchParams.get("intent") === "signup" ? "signup" : "signin";
  if (!isWorkOSAuthConfigured()) {
    const url = publicUrl(request, intent === "signup" ? "/signup" : "/login");
    url.searchParams.set("next", nextPath);
    url.searchParams.set("error", "workos_unconfigured");
    return NextResponse.redirect(url, { status: 303 });
  }

  const { state, cookieValue, maxAge } = createWorkOSState(nextPath, intent);
  const response = NextResponse.redirect(buildWorkOSAuthorizeUrl(state, method), { status: 303 });

  response.cookies.set(WORKOS_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge,
  });

  return response;
}
