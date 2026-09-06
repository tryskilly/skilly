import { NextResponse, type NextRequest } from "next/server";
import { buildPersonalCheckoutBody, hasCurrentPersonalEntitlement, isValidBillingUrl, parseCheckoutAttemptId } from "@/domain/billing";
import { getMacEntitlement, authenticateMacRequest } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";
import { publicUrl } from "@/lib/requestOrigin";
import { validateBillingEnvironment } from "@/domain/billingEnvironment";
import { logBillingFailure } from "@/lib/billingDiagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = authenticateMacRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const existing = await getMacEntitlement(session.userId);
  if (hasCurrentPersonalEntitlement(existing)) {
    return NextResponse.json({ error: "already_subscribed" }, { status: 409 });
  }
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  const productId = process.env.POLAR_MAC_PRODUCT_ID ?? process.env.POLAR_BETA_PRODUCT_ID;
  const billingEnv = validateBillingEnvironment({ surface: "personal", productId, host: request.headers.get("host") });
  if (!billingEnv.ok || !accessToken) {
    logBillingFailure({ surface: "mac_checkout", reason: "billing_not_configured" });
    return NextResponse.json({ error: "billing not configured" }, { status: 500 });
  }
  const configuredProductId = productId!;
  const configuredAccessToken = accessToken!;
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "invalid request body" }, { status: 400 }); }
  const attemptValue = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>).checkout_attempt_id : undefined;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  const attempt = parseCheckoutAttemptId(attemptValue);
  if (!attempt.valid) return NextResponse.json({ error: "invalid checkout_attempt_id" }, { status: 400 });
  const body = buildPersonalCheckoutBody({
    productId: configuredProductId,
    userId: session.userId,
    email: session.email,
    surface: "mac",
    checkoutAttemptId: attempt.value,
    successUrl: publicUrl(request, "/dashboard/billing?surface=mac").toString(),
  });
  let response: Response;
  try {
    response = await fetch(`${billingEnv.apiBase}/v1/checkouts`, {
      method: "POST",
      headers: { authorization: `Bearer ${configuredAccessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    logBillingFailure({ surface: "mac_checkout", reason: "provider_network_error" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  if (!response.ok) {
    logBillingFailure({ surface: "mac_checkout", status: response.status, reason: "provider_non_2xx" });
    await captureServerEvent("mac_checkout_failed", { workos_user_id: session.userId, status: response.status, source_surface: "studio_backend" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  let checkout: { url?: unknown; checkout_url?: unknown };
  try {
    checkout = (await response.json()) as { url?: unknown; checkout_url?: unknown };
  } catch {
    logBillingFailure({ surface: "mac_checkout", status: response.status, reason: "provider_invalid_json" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  if (!checkout || typeof checkout !== "object" || Array.isArray(checkout)) {
    logBillingFailure({ surface: "mac_checkout", status: response.status, reason: "provider_missing_url" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  const checkoutUrl = checkout.checkout_url ?? checkout.url;
  if (typeof checkoutUrl !== "string") {
    logBillingFailure({ surface: "mac_checkout", status: response.status, reason: "provider_missing_url" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  if (!isValidBillingUrl(checkoutUrl)) {
    logBillingFailure({ surface: "mac_checkout", status: response.status, reason: "provider_invalid_url" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  await captureServerEvent("mac_checkout_url_created", { workos_user_id: session.userId, source_surface: "studio_backend", checkout_attempt_id: String((body.metadata as Record<string, unknown>).checkout_attempt_id) });
  return NextResponse.json({ checkout_url: checkoutUrl }, { status: 200 });
}
