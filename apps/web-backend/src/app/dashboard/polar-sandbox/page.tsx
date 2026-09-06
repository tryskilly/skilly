import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { validateBillingEnvironment } from "@/domain/billingEnvironment";
import { PolarSandboxActions } from "./PolarSandboxActions";

export const dynamic = "force-dynamic";

export default async function PolarSandboxPage() {
  await requireDashboardSession();
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const canonicalHost = process.env.SKILLY_PREVIEW_HOST ?? process.env.VERCEL_URL;
  const builder = validateBillingEnvironment({ surface: "builder", productId: process.env.POLAR_BUILDER_STARTER_PRODUCT_ID, host });
  const personal = validateBillingEnvironment({ surface: "personal", productId: process.env.POLAR_MAC_PRODUCT_ID, host });
  if (!host || !canonicalHost || host.split(":")[0].toLowerCase() !== canonicalHost.split(":")[0].toLowerCase() || !builder.ok || !personal.ok || builder.mode !== "sandbox" || personal.mode !== "sandbox" || process.env.VERCEL_ENV !== "preview") notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-xl border border-red-500/60 bg-red-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">SANDBOX ONLY</p>
        <h1 className="mt-2 text-2xl font-extrabold text-gray-100">Polar checkout verification</h1>
        <p className="mt-2 text-sm text-gray-300">Preview deployment, sandbox Polar, and sandbox database only. Never use this page for production billing.</p>
      </div>
      <PolarSandboxActions />
    </div>
  );
}
