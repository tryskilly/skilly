import { NextResponse, type NextRequest } from "next/server";
import {
  configuredDashboardRole,
  setDashboardSession,
  verifyDashboardPassword,
} from "@/lib/dashboardAuth";
import { getDefaultTenantId } from "@/lib/session";
import { publicUrl } from "@/lib/requestOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNextPath(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value : "";
  return raw.startsWith("/dashboard") ? raw : "/dashboard";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const nextPath = safeNextPath(formData.get("next"));
  const password = String(formData.get("password") ?? "");

  if (!verifyDashboardPassword(password)) {
    const url = publicUrl(request, "/login");
    url.searchParams.set("next", nextPath);
    url.searchParams.set("error", "invalid");
    return NextResponse.redirect(url, { status: 303 });
  }

  await setDashboardSession({
    role: configuredDashboardRole(),
    tenantId: getDefaultTenantId(),
    issuedAt: Date.now(),
  });

  return NextResponse.redirect(publicUrl(request, nextPath), { status: 303 });
}
