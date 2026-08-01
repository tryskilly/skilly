// POST /api/mac/byok/checkout — start a low-cost Polar checkout for Mac users
// who bring their own OpenAI key. This is separate from relay billing so BYOK
// can pay a platform fee without consuming Skilly's shared OpenAI budget.

import { NextResponse, type NextRequest } from "next/server";
import { authenticateMacRequestWithWorkerFallback } from "@/lib/macSession";
import { publicUrl } from "@/lib/requestOrigin";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await authenticateMacRequestWithWorkerFallback(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  const productId = process.env.POLAR_MAC_BYOK_PRODUCT_ID ?? process.env.POLAR_BYOK_PRODUCT_ID;
  const apiBase = process.env.POLAR_API_BASE ?? "https://api.polar.sh";
  if (!accessToken || !productId) {
    await captureServerEvent("mac_byok_checkout_failed", {
      workos_user_id: session.userId,
      reason: "billing_not_configured",
      source_surface: "studio_backend",
    });
    return NextResponse.json({ error: "billing not configured" }, { status: 500 });
  }

  await captureServerEvent("mac_byok_checkout_started", {
    workos_user_id: session.userId,
    source_surface: "studio_backend",
  });

  const response = await fetch(`${apiBase}/v1/checkouts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      products: [productId],
      success_url: publicUrl(request, "/dashboard/billing?surface=mac-byok").toString(),
      metadata: {
        surface: "mac",
        plan: "byok",
        macUserId: session.userId,
        email: session.email,
      },
    }),
  });

  if (!response.ok) {
    await captureServerEvent("mac_byok_checkout_failed", {
      workos_user_id: session.userId,
      status: response.status,
      source_surface: "studio_backend",
    });
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }

  const checkout = (await response.json()) as { url?: string; checkout_url?: string };
  await captureServerEvent("mac_byok_checkout_url_created", {
    workos_user_id: session.userId,
    source_surface: "studio_backend",
  });

  return NextResponse.json({ url: checkout.url ?? checkout.checkout_url ?? null }, { status: 200 });
}
