import { NextResponse } from "next/server";
import { fetchSiteImportPreview } from "@/domain/siteImport";
import { getDashboardSession } from "@/lib/dashboardAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getDashboardSession();
  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url : "";
  if (!url.trim()) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  try {
    const preview = await fetchSiteImportPreview(url);
    return NextResponse.json({ preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import this site.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
