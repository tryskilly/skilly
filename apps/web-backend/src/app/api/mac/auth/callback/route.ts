import { type NextRequest } from "next/server";
import { isValidDesktopOAuthState } from "@/lib/desktopAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Response {
  const requestURL = request.nextUrl ?? new URL(request.url);
  const code = requestURL.searchParams.get("code");
  const state = requestURL.searchParams.get("state");
  if (!code || code.length > 2048 || !isValidDesktopOAuthState(state)) {
    return new Response("Invalid authorization response", { status: 400 });
  }
  const callback = new URL("skilly://auth/callback");
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", state);
  const target = callback.toString();
  const htmlTarget = target.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const scriptTarget = target.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return new Response(`<!doctype html><meta charset="utf-8"><title>Opening Skilly</title><p>Opening Skilly… <a href="${htmlTarget}">Continue</a></p><script>location.href="${scriptTarget}"</script>`, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
