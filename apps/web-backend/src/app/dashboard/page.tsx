import Link from "next/link";
import { getRepo } from "@/db";
import { getCurrentTenantId } from "@/lib/session";
import { KeyManager } from "./KeyManager";

export const dynamic = "force-dynamic";

function formatUsage(usageSeconds: number, capSeconds: number): string {
  const minutes = Math.round(usageSeconds / 60);
  if (capSeconds <= 0) {
    return `${minutes} min used (unlimited)`;
  }
  return `${minutes} / ${Math.round(capSeconds / 60)} min used this month`;
}

export default async function DashboardPage() {
  const repo = getRepo();
  const tenantId = getCurrentTenantId();
  const [tenant, keys, usage] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listApiKeys(tenantId),
    repo.getUsageSummary(tenantId),
  ]);

  const usedFraction =
    usage.capSeconds > 0 ? Math.min(1, usage.usageSecondsThisPeriod / usage.capSeconds) : 0;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium text-blue-400">Skilly Web</p>
        <h1 className="mt-1 text-2xl font-semibold">{tenant?.name ?? "Dashboard"}</h1>
      </header>

      <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Usage</h2>
        <p className="mt-2 text-lg">{formatUsage(usage.usageSecondsThisPeriod, usage.capSeconds)}</p>
        {usage.capSeconds > 0 && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${usedFraction * 100}%` }} />
          </div>
        )}
      </section>

      <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Allowed origins</h2>
        {tenant && tenant.allowedOrigins.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-neutral-300">
            {tenant.allowedOrigins.map((origin) => (
              <li key={origin} className="font-mono">{origin}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">No origins configured.</p>
        )}
      </section>

      <KeyManager keys={keys} />

      <section className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Teaching skill</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Author the SKILL.md your companion teaches from. It's safety-scanned before it's served.
        </p>
        <Link
          href="/dashboard/skill"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Edit skill →
        </Link>
      </section>
    </main>
  );
}
