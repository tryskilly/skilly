import { NextResponse, type NextRequest } from "next/server";
import { buildPersonalCheckoutBody, hasCurrentPersonalEntitlement, isValidBillingUrl, parseCheckoutAttemptId } from "@/domain/billing";
import { getMacEntitlement, authenticateMacRequest } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";
import { publicUrl } from "@/lib/requestOrigin";
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
  const body = buildPersonalCheckoutBody({
    productId: configuredProductId,
    userId: session.userId,
    email: session.email,
    surface: "mac",
    checkoutAttemptId: attempt.value,
    successUrl: publicUrl(request, "/dashboard/billing?surface=mac").toString(),
  });
  const response = await fetch(`${billingEnv.apiBase}/v1/checkouts`, {
    method: "POST",
    headers: { authorization: `Bearer ${configuredAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await captureServerEvent("mac_checkout_failed", { workos_user_id: session.userId, status: response.status, source_surface: "studio_backend" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  const checkout = (await response.json()) as { url?: string; checkout_url?: string };
  const checkoutUrl = checkout.checkout_url ?? checkout.url;
  if (!isValidBillingUrl(checkoutUrl)) return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  await captureServerEvent("mac_checkout_url_created", { workos_user_id: session.userId, source_surface: "studio_backend", checkout_attempt_id: String((body.metadata as Record<string, unknown>).checkout_attempt_id) });
  return NextResponse.json({ checkout_url: checkoutUrl }, { status: 200 });
}
