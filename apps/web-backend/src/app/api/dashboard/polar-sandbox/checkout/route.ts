import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { mintShortLivedDesktopSessionToken } from "@/lib/desktopAuth";
import { orchestratePolarSandboxCheckout } from "@/lib/polarSandbox";
import { validatePolarSandboxRequest } from "@/lib/polarSandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireDashboardSession();
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid request" }, { status: 400 }); }
  const product = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).product : undefined;
  if (product !== "builder-starter" && product !== "mac") return NextResponse.json({ error: "invalid product" }, { status: 400 });
  const productId = product === "mac" ? process.env.POLAR_MAC_PRODUCT_ID : process.env.POLAR_BUILDER_STARTER_PRODUCT_ID;
  const guard = validatePolarSandboxRequest(request, productId);
  if (!guard.ok || !productId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = await orchestratePolarSandboxCheckout({ product, session, requestUrl: request.url, cookie: request.headers.get("cookie"), mintToken: mintShortLivedDesktopSessionToken });
  return NextResponse.json(result.body, { status: result.status });
}
