import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { setDashboardSession } from "@/lib/dashboardAuth";
import {
  createSelfServeDashboardMembership,
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
    const repo = getRepo();
    let membership = await resolveDashboardMembership(repo, auth);

    // Self-serve signup: a brand-new WorkOS user arriving via the /signup entry
    // (intent === "signup") with no membership gets a fresh tenant + super_admin
    // membership, then routes to onboarding. An existing member who happens to
    // use the signup entry still just signs in normally (membership resolves).
    if (!membership && storedState.intent === "signup") {
      membership = await createSelfServeDashboardMembership(repo, auth);
      await setDashboardSession({
        role: membership.role,
        tenantId: membership.tenantId,
        issuedAt: Date.now(),
        workosUserId: auth.user.id,
        email: auth.user.email ?? membership.email,
        workosOrganizationId: membership.workosOrganizationId ?? auth.workosOrganizationId,
      });
      // New tenant → onboarding. Carry the stored nextPath if it was onboarding-scoped.
      const onboardingPath = storedState.nextPath.startsWith("/onboarding") ? storedState.nextPath : "/onboarding/company";
      const response = NextResponse.redirect(publicUrl(request, onboardingPath), { status: 303 });
      response.cookies.delete(WORKOS_STATE_COOKIE);
      return response;
    }

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
