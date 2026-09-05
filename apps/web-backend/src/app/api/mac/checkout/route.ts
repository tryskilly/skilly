import { NextResponse, type NextRequest } from "next/server";
import { buildPersonalCheckoutBody, hasCurrentPersonalEntitlement } from "@/domain/billing";
import { getMacEntitlement, authenticateMacRequest } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";
import { publicUrl } from "@/lib/requestOrigin";

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
  if (!accessToken || !productId) return NextResponse.json({ error: "billing not configured" }, { status: 500 });
  const payload = (await request.json().catch(() => ({}))) as { checkout_attempt_id?: unknown };
  const body = buildPersonalCheckoutBody({
    productId,
    userId: session.userId,
    email: session.email,
    surface: "mac",
    checkoutAttemptId: typeof payload.checkout_attempt_id === "string" ? payload.checkout_attempt_id : null,
    successUrl: publicUrl(request, "/dashboard/billing?surface=mac").toString(),
  });
  const response = await fetch(`${process.env.POLAR_API_BASE ?? "https://api.polar.sh"}/v1/checkouts`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await captureServerEvent("mac_checkout_failed", { workos_user_id: session.userId, status: response.status, source_surface: "studio_backend" });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
  const checkout = (await response.json()) as { url?: string; checkout_url?: string };
  await captureServerEvent("mac_checkout_url_created", { workos_user_id: session.userId, source_surface: "studio_backend" });
  return NextResponse.json({ checkout_url: checkout.checkout_url ?? checkout.url ?? null }, { status: 200 });
}
