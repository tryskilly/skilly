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

function authRedirect(
  request: NextRequest,
  error: string,
  nextPath: string,
  intent: "signin" | "signup",
): NextResponse {
  const url = publicUrl(request, intent === "signup" ? "/signup" : "/login");
  url.searchParams.set("next", nextPath);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const nextPath = safeDashboardNextPath(String(formData.get("next") ?? ""));
  const email = normalizeWorkOSEmail(String(formData.get("email") ?? ""));
  const intent = formData.get("intent") === "signup" ? "signup" : "signin";

  if (!isWorkOSAuthConfigured()) {
    return authRedirect(request, "workos_unconfigured", nextPath, intent);
  }
  if (!email) {
    return authRedirect(request, "magic_email", nextPath, intent);
  }

  try {
    await sendWorkOSMagicAuthCode(email);
    const pending = createWorkOSMagicEmailCookie(email, nextPath, intent);
    const verifyUrl = publicUrl(request, "/login/verify");
    verifyUrl.searchParams.set("next", nextPath);
    if (intent === "signup") {
      verifyUrl.searchParams.set("intent", "signup");
    }
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
    return authRedirect(request, "magic_start", nextPath, intent);
  }
}
