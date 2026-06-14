import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "@/lib/requestOrigin";
import {
  createWorkOSMagicEmailCookie,
  isWorkOSAuthConfigured,
  normalizeWorkOSEmail,
  safeDashboardNextPath,
  sendWorkOSMagicAuthCode,
  WORKOS_MAGIC_EMAIL_COOKIE,
} from "@/lib/workosAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function loginRedirect(request: NextRequest, error: string, nextPath: string): NextResponse {
  const url = publicUrl(request, "/login");
  url.searchParams.set("next", nextPath);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const nextPath = safeDashboardNextPath(String(formData.get("next") ?? ""));
  const email = normalizeWorkOSEmail(String(formData.get("email") ?? ""));

  if (!isWorkOSAuthConfigured()) {
    return loginRedirect(request, "workos_unconfigured", nextPath);
  }
  if (!email) {
    return loginRedirect(request, "magic_email", nextPath);
  }

  try {
    await sendWorkOSMagicAuthCode(email);
    const pending = createWorkOSMagicEmailCookie(email, nextPath);
    const verifyUrl = publicUrl(request, "/login/verify");
    verifyUrl.searchParams.set("next", nextPath);
    const response = NextResponse.redirect(verifyUrl, { status: 303 });
    response.cookies.set(WORKOS_MAGIC_EMAIL_COOKIE, pending.cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction(),
      path: "/",
      maxAge: pending.maxAge,
    });
    return response;
  } catch (error) {
    console.error("[workos-magic-start] Failed to send Magic Auth code", error);
    return loginRedirect(request, "magic_start", nextPath);
  }
}
