// POST /api/web/checkout — start a Polar checkout for the current dashboard
// tenant (not the widget). Returns the hosted checkout URL to redirect to. The
// tenant id is attached as metadata so the webhook can apply the plan on success.

import { NextResponse, type NextRequest } from "next/server";
import { buildCheckoutBody } from "@/domain/billing";
import { getCurrentTenantId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  const productId = process.env.POLAR_PRODUCT_ID;
  const apiBase = process.env.POLAR_API_BASE ?? "https://api.polar.sh";
  if (!accessToken || !productId) {
    return NextResponse.json({ error: "billing not configured" }, { status: 500 });
  }

  const body = buildCheckoutBody({
    productId,
    tenantId: getCurrentTenantId(),
    successUrl: new URL("/dashboard", request.nextUrl.origin).toString(),
  });

  const response = await fetch(`${apiBase}/v1/checkouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }

  const checkout = (await response.json()) as { url?: string; checkout_url?: string };
  return NextResponse.json({ url: checkout.url ?? checkout.checkout_url ?? null }, { status: 200 });
}
