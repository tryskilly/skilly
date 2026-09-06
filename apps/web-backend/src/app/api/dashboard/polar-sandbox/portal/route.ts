import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { mintShortLivedDesktopSessionToken } from "@/lib/desktopAuth";
import { orchestratePolarSandboxPortal, validatePolarSandboxRequest } from "@/lib/polarSandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireDashboardSession();
  const productId = process.env.POLAR_MAC_PRODUCT_ID;
  const guard = validatePolarSandboxRequest(request, productId);
  if (!guard.ok || !productId) return NextResponse.json({ error: "not found" }, { status: 404 });
  const result = await orchestratePolarSandboxPortal({
    session,
    requestUrl: request.url,
    cookie: request.headers.get("cookie"),
    mintToken: mintShortLivedDesktopSessionToken,
  });
  return NextResponse.json(result.body, { status: result.status });
}
