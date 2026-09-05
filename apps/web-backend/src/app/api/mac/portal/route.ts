import { NextResponse, type NextRequest } from "next/server";
import { getMacEntitlement, authenticateMacRequest } from "@/lib/macSession";
import { isValidBillingUrl } from "@/domain/billing";
import { captureServerEvent } from "@/lib/analytics";
import { publicUrl } from "@/lib/requestOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = authenticateMacRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  const record = await getMacEntitlement(session.userId);
  if (!accessToken) return NextResponse.json({ error: "billing not configured" }, { status: 500 });
  if (!record?.polar_customer_id) return NextResponse.json({ error: "no_subscription", fallback: "checkout" }, { status: 409 });
  const response = await fetch(`${process.env.POLAR_API_BASE ?? "https://api.polar.sh"}/v1/customer-sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ customer_id: record.polar_customer_id, return_url: publicUrl(request, "/dashboard/billing?surface=mac").toString() }),
  });
  if (!response.ok) return NextResponse.json({ error: "portal session failed" }, { status: 502 });
  const portal = (await response.json()) as { customer_portal_url?: string; url?: string };
  const portalUrl = portal.customer_portal_url ?? portal.url;
  if (!isValidBillingUrl(portalUrl)) return NextResponse.json({ error: "portal session failed" }, { status: 502 });
  await captureServerEvent("mac_portal_url_created", { workos_user_id: session.userId, source_surface: "studio_backend" });
  return NextResponse.json({ portal_url: portalUrl }, { status: 200 });
}

export const POST = GET;
