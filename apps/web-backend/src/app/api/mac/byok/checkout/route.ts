// POST /api/mac/byok/checkout — start a low-cost Polar checkout for Mac users
// who bring their own OpenAI key. This is separate from relay billing so BYOK
// can pay a platform fee without consuming Skilly's shared OpenAI budget.

import { NextResponse, type NextRequest } from "next/server";
import { CheckoutPayloadError, buildByokCheckoutBody, checkoutFailureReason, macCheckoutSuccessUrl } from "@/domain/billing";
import { authenticateMacRequest, recordMacCheckoutStarted } from "@/lib/macSession";
import { captureCheckoutFailed, recordCheckoutStartedWithoutBlockingPayment } from "@/lib/billingDiagnostics";
import { captureServerEvent } from "@/lib/analytics";
import { validateBillingEnvironment } from "@/domain/billingEnvironment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = authenticateMacRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  const productId = process.env.POLAR_MAC_BYOK_PRODUCT_ID ?? process.env.POLAR_BYOK_PRODUCT_ID;
  const billingEnv = validateBillingEnvironment({ surface: "byok", productId, host: request.headers.get("host") });
  if (!billingEnv.ok || !accessToken || !productId) {
    await captureServerEvent("mac_byok_checkout_failed", {
      workos_user_id: session.userId,
      reason: "billing_not_configured",
      source_surface: "studio_backend",
    });
    await captureCheckoutFailed({ reason: "billing_not_configured", sourceSurface: "studio_backend", distinctId: session.userId, plan: "byok" });
    return NextResponse.json({ error: "billing not configured" }, { status: 500 });
  }

  await captureServerEvent("mac_byok_checkout_started", {
    workos_user_id: session.userId,
    source_surface: "studio_backend",
  });

  let body: Record<string, unknown>;
  try {
    body = buildByokCheckoutBody({
      productId,
      userId: session.userId,
      email: session.email,
      successUrl: macCheckoutSuccessUrl(session.userId),
    });
  } catch (error) {
    if (error instanceof CheckoutPayloadError) {
      await captureCheckoutFailed({ reason: error.reason, sourceSurface: "studio_backend", distinctId: session.userId, plan: "byok" });
      return NextResponse.json({ error: "checkout creation failed", reason: error.reason }, { status: 400 });
    }
    throw error;
  }
  const response = await fetch(`${billingEnv.apiBase}/v1/checkouts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const providerBody = await response.text();
    const reason = checkoutFailureReason(response.status, providerBody);
    await captureServerEvent("mac_byok_checkout_failed", {
      workos_user_id: session.userId,
      status: response.status,
      reason,
      source_surface: "studio_backend",
    });
    await captureCheckoutFailed({ reason, status: response.status, sourceSurface: "studio_backend", distinctId: session.userId, plan: "byok" });
    return NextResponse.json({ error: "checkout creation failed", reason }, { status: 502 });
  }

  const checkout = (await response.json()) as { url?: string; checkout_url?: string };
  await recordCheckoutStartedWithoutBlockingPayment(() => recordMacCheckoutStarted(session.userId, session.email));
  await captureServerEvent("mac_byok_checkout_url_created", {
    workos_user_id: session.userId,
    source_surface: "studio_backend",
  });

  return NextResponse.json({ url: checkout.url ?? checkout.checkout_url ?? null }, { status: 200 });
}
