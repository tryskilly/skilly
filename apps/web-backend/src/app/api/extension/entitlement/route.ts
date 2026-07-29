// GET /api/extension/entitlement — reuses the exact same entitlement table Mac reads.
// mac_entitlements is keyed by WorkOS user id, not by client surface, so one paying subscription
// unlocks both Mac and the extension with zero schema change.
//
// Unlike /api/mac/entitlement, this route takes no ?user_id= override at all: the extension only
// ever asks about itself, so the authenticated session's user id is the only id consulted.

import { NextResponse, type NextRequest } from "next/server";
import { authenticateExtensionRequest } from "@/lib/extensionSession";
import { getMacEntitlement } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = authenticateExtensionRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await getMacEntitlement(session.userId);
  await captureServerEvent("extension_entitlement_checked", {
    workos_user_id: session.userId,
    status: record?.status ?? "none",
    entitlement_type: record?.entitlement_type ?? undefined,
    source_surface: "studio_backend",
  });

  // A user with no row is not an error — they simply haven't subscribed yet, and the extension
  // renders that as its signed-out-of-plan state. Mirrors /api/mac/entitlement's contract.
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
