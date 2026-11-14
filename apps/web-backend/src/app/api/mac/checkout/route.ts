import { NextResponse, type NextRequest } from "next/server";
import { CheckoutPayloadError, buildPersonalCheckoutBody, checkoutFailureReason, hasCurrentPersonalEntitlement, isValidBillingUrl, macCheckoutSuccessUrl, parseCheckoutAttemptId } from "@/domain/billing";
import { getMacEntitlement, authenticateMacRequest, recordMacCheckoutStarted } from "@/lib/macSession";
import { captureCheckoutFailed, recordCheckoutStartedWithoutBlockingPayment } from "@/lib/billingDiagnostics";
import { captureServerEvent } from "@/lib/analytics";
import { validateBillingEnvironment } from "@/domain/billingEnvironment";

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
  if (!billingEnv.ok || !accessToken) return NextResponse.json({ error: "billing not configured" }, { status: 500 });
  const configuredProductId = productId!;
  const configuredAccessToken = accessToken!;
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "invalid request body" }, { status: 400 }); }
  const attemptValue = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>).checkout_attempt_id : undefined;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  const attempt = parseCheckoutAttemptId(attemptValue);
  if (!attempt.valid) return NextResponse.json({ error: "invalid checkout_attempt_id" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = buildPersonalCheckoutBody({
      productId: configuredProductId,
      userId: session.userId,
      email: session.email,
      surface: "mac",
      checkoutAttemptId: attempt.value,
      // The marketing page deep-links skilly://checkout-success so the Mac app
      // refreshes entitlement when Polar sends the customer back.
      successUrl: macCheckoutSuccessUrl(session.userId),
    });
  } catch (error) {
    if (error instanceof CheckoutPayloadError) {
      await captureCheckoutFailed({ reason: error.reason, sourceSurface: "studio_backend", distinctId: session.userId, plan: "beta_19" });
      return NextResponse.json({ error: "checkout creation failed", reason: error.reason }, { status: 400 });
    }
    throw error;
  }
  const response = await fetch(`${billingEnv.apiBase}/v1/checkouts`, {
    method: "POST",
    headers: { authorization: `Bearer ${configuredAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const providerBody = await response.text();
    const reason = checkoutFailureReason(response.status, providerBody);
    await captureServerEvent("mac_checkout_failed", { workos_user_id: session.userId, status: response.status, reason, source_surface: "studio_backend" });
    await captureCheckoutFailed({ reason, status: response.status, sourceSurface: "studio_backend", distinctId: session.userId, plan: "beta_19" });
    return NextResponse.json({ error: "checkout creation failed", reason }, { status: 502 });
  }
  const checkout = (await response.json()) as { url?: string; checkout_url?: string };
  const checkoutUrl = checkout.checkout_url ?? checkout.url;
  if (!isValidBillingUrl(checkoutUrl)) {
    await captureCheckoutFailed({ reason: "provider_invalid_url", status: response.status, sourceSurface: "studio_backend", distinctId: session.userId, plan: "beta_19" });
    return NextResponse.json({ error: "checkout creation failed", reason: "provider_invalid_url" }, { status: 502 });
  }
  await recordCheckoutStartedWithoutBlockingPayment(() => recordMacCheckoutStarted(session.userId, session.email));
  await captureServerEvent("mac_checkout_url_created", { workos_user_id: session.userId, source_surface: "studio_backend", checkout_attempt_id: String((body.metadata as Record<string, unknown>).checkout_attempt_id) });
  return NextResponse.json({ checkout_url: checkoutUrl }, { status: 200 });
}
