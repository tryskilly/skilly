import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { setDashboardSession } from "@/lib/dashboardAuth";
import {
  exchangeWorkOSCode,
  parseWorkOSStateCookie,
  resolveDashboardMembership,
  WORKOS_STATE_COOKIE,
} from "@/lib/workosAuth";
import { publicUrl } from "@/lib/requestOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loginRedirect(request: NextRequest, error: string): NextResponse {
  const url = publicUrl(request, "/login");
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const storedState = parseWorkOSStateCookie(request.cookies.get(WORKOS_STATE_COOKIE)?.value);

  if (!code || !returnedState || !storedState || returnedState !== storedState.nonce) {
    return loginRedirect(request, "workos_state");
  }

  try {
    const auth = await exchangeWorkOSCode(code);
    const membership = await resolveDashboardMembership(getRepo(), auth);

    if (!membership) {
      console.warn("[workos-callback] No dashboard membership for WorkOS user", {
        workosUserId: auth.user.id,
        email: auth.user.email,
        workosOrganizationId: auth.workosOrganizationId,
      });
      return loginRedirect(request, "no_membership");
    }

    await setDashboardSession({
      role: membership.role,
      tenantId: membership.tenantId,
      issuedAt: Date.now(),
      workosUserId: auth.user.id,
      email: auth.user.email ?? membership.email,
      workosOrganizationId: membership.workosOrganizationId ?? auth.workosOrganizationId,
    });

    const response = NextResponse.redirect(publicUrl(request, storedState.nextPath), { status: 303 });
    response.cookies.delete(WORKOS_STATE_COOKIE);
    return response;
  } catch (error) {
    console.error("[workos-callback] Dashboard auth failed", error);
    return loginRedirect(request, "workos");
  }
}
