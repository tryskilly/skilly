import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/db";
import { setDashboardSession } from "@/lib/dashboardAuth";
import { publicUrl } from "@/lib/requestOrigin";
import {
  createSelfServeDashboardMembership,
  exchangeWorkOSMagicAuthCode,
  parseWorkOSMagicEmailCookie,
  resolveDashboardMembership,
  safeDashboardNextPath,
  WORKOS_MAGIC_EMAIL_COOKIE,
} from "@/lib/workosAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyRedirect(
  request: NextRequest,
  error: string,
  nextPath: string,
  intent: "signin" | "signup" = "signin",
): NextResponse {
  const url = publicUrl(request, "/login/verify");
  url.searchParams.set("next", nextPath);
  url.searchParams.set("error", error);
  if (intent === "signup") {
    url.searchParams.set("intent", "signup");
  }
  return NextResponse.redirect(url, { status: 303 });
}

function authRedirect(
  request: NextRequest,
  error: string,
  nextPath: string,
  intent: "signin" | "signup" = "signin",
): NextResponse {
  const url = publicUrl(request, intent === "signup" ? "/signup" : "/login");
  url.searchParams.set("next", nextPath);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const pending = parseWorkOSMagicEmailCookie(request.cookies.get(WORKOS_MAGIC_EMAIL_COOKIE)?.value);
  const nextPath = safeDashboardNextPath(String(formData.get("next") ?? pending?.nextPath ?? ""));
  const intent = pending?.intent ?? (formData.get("intent") === "signup" ? "signup" : "signin");
  const code = String(formData.get("code") ?? "").trim().replace(/\s+/g, "");

  if (!pending) {
    return authRedirect(request, "magic_expired", nextPath, intent);
  }
  if (!code) {
    return verifyRedirect(request, "magic_code", nextPath, intent);
  }

  try {
    const auth = await exchangeWorkOSMagicAuthCode(pending.email, code);
    const repo = getRepo();
    let membership = await resolveDashboardMembership(repo, auth);

    if (!membership && pending.intent === "signup") {
      membership = await createSelfServeDashboardMembership(repo, auth);
    }

    if (!membership) {
      console.warn("[workos-magic-verify] No dashboard membership for WorkOS user", {
        workosUserId: auth.user.id,
        email: auth.user.email,
        workosOrganizationId: auth.workosOrganizationId,
      });
      return authRedirect(request, "no_membership", nextPath, intent);
    }

    await setDashboardSession({
      role: membership.role,
      tenantId: membership.tenantId,
      issuedAt: Date.now(),
      workosUserId: auth.user.id,
      email: auth.user.email ?? membership.email,
      workosOrganizationId: membership.workosOrganizationId ?? auth.workosOrganizationId,
    });

    const redirectPath =
      pending.intent === "signup" && !pending.nextPath.startsWith("/onboarding")
        ? "/onboarding/company"
        : pending.nextPath;
    const response = NextResponse.redirect(publicUrl(request, redirectPath), { status: 303 });
    response.cookies.delete(WORKOS_MAGIC_EMAIL_COOKIE);
    return response;
  } catch (error) {
    console.error("[workos-magic-verify] Magic Auth verification failed", error);
    return verifyRedirect(request, "magic_code", nextPath, intent);
  }
}
