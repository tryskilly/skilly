"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRepo } from "@/db";
import { captureServerEvent } from "@/lib/analytics";
import { requireDashboardSession } from "@/lib/dashboardAuth";

/*
 * Onboarding server actions. Each completes its step's mutation, then redirects
 * to the next step (server actions that call redirect() navigate the browser).
 * The session was issued by the WorkOS signup callback scoped to the new tenant.
 */

/** Step 1: rename the auto-created tenant, then advance to install. */
export async function onboardingCompanyAction(formData: FormData): Promise<void> {
  const session = await requireDashboardSession();
  const tenantId = session.tenantId;
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    await getRepo().updateTenantName(tenantId, name);
    await captureServerEvent("onboarding_company_named", {
      tenant_id: tenantId,
      account_email: session.email ?? undefined,
      source_surface: "web_onboarding",
    });
    revalidatePath("/dashboard");
    revalidatePath("/onboarding");
  }
  redirect("/onboarding/install");
}
