// GET /api/mac/entitlement — Mac-compatible entitlement lookup.
// Studio is authoritative: an absent user row means no subscription; database
// failures propagate so they cannot be mistaken for a successful empty lookup.

import { NextResponse, type NextRequest } from "next/server";
import { authenticateMacRequest, getMacEntitlement } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = authenticateMacRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIdFromQuery = request.nextUrl.searchParams.get("user_id");
  if (userIdFromQuery && userIdFromQuery !== session.userId) {
    return NextResponse.json({ error: "Requested user does not match authenticated user" }, { status: 403 });
  }

  const record = await getMacEntitlement(session.userId);
  await captureServerEvent("mac_entitlement_checked", {
    workos_user_id: session.userId,
    status: record?.status ?? "none",
    entitlement_type: record?.entitlement_type ?? undefined,
    source_surface: "studio_backend",
  });
  return NextResponse.json(
    record ?? {
      user_id: session.userId,
      status: "none",
      entitlement_type: null,
      period_start: null,
      period_end: null,
      plan: null,
      polar_customer_id: null,
    },
  );
}
