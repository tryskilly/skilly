import { getRepo } from "@/db";
import { DEFAULT_SKILL_ID, getCurrentDashboardTenantId } from "@/lib/session";
import { Badge, ButtonLink, Card, SectionHeader, UsageMeter } from "./ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repo = getRepo();
  const tenantId = await getCurrentDashboardTenantId();
  const [tenant, keys, usage, skill] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listApiKeys(tenantId),
    repo.getUsageSummary(tenantId),
    repo.getTenantSkill(tenantId, DEFAULT_SKILL_ID),
  ]);

  const hasOrigin = Boolean(tenant?.allowedOrigins.length);
  const hasPublishableKey = keys.some((key) => key.keyType === "publishable" && !key.revoked);
  const hasSkill = Boolean(skill?.content.trim());
  // "Test widget" is considered ready once the tenant can actually serve a
  // widget session: origin + publishable key + skill all in place. The
  // Test widget button on the page links to the live preview, so once the
  // prerequisites are met the step is satisfiable.
  const canTestWidget = hasOrigin && hasPublishableKey && hasSkill;
  const setupSteps = [
    { label: "Create workspace", done: Boolean(tenant) },
    { label: "Add allowed origin", done: hasOrigin },
    { label: "Generate publishable key", done: hasPublishableKey },
    { label: "Install script", done: hasOrigin && hasPublishableKey },
    { label: "Save teaching skill", done: hasSkill },
    { label: "Test widget", done: canTestWidget },
  ];
  const firstIncomplete = setupSteps.findIndex((step) => !step.done);

  return (
    <>
      <section className="mb-8">
        <Badge tone="amber">Skilly Web</Badge>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold leading-tight tracking-[-0.045em] md:text-5xl">
          Install, teach, and monitor your Skilly companion.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-neutral-400">
          A warm control room for embedded AI teaching across web, mobile, and future desktop surfaces.
          Configure tenancy, serve SKILL.md, meter usage, and test the assistant before going live.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <SectionHeader title="Finish setup" action={<Badge tone="amber">{Math.max(0, setupSteps.length - setupSteps.filter((step) => step.done).length)} steps left</Badge>} />
          <ul className="grid gap-2">
            {setupSteps.map((step, index) => (
              <li
                key={step.label}
                className={`flex items-center justify-between gap-4 rounded-lg border px-3 py-3 ${
                  index === firstIncomplete
                    ? "border-amber-500/35 bg-amber-500/15"
                    : "border-white/[0.07] bg-white/[0.035]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full text-xs font-extrabold ${
                      step.done
                        ? "bg-green-500/20 text-green-300"
                        : index === firstIncomplete
                          ? "bg-amber-500 text-neutral-950"
                          : "bg-white/[0.08] text-neutral-500"
                    }`}
                  >
                    {step.done ? "✓" : index === firstIncomplete ? "!" : ""}
                  </span>
                  <span className={index === firstIncomplete ? "text-amber-200" : "text-neutral-300"}>{step.label}</span>
                </div>
                <span className="text-xs text-neutral-500">{step.done ? "Done" : "Pending"}</span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid gap-4">
          <Card>
            <h2 className="mb-3 text-base font-bold">Usage this month</h2>
            <UsageMeter usedSeconds={usage.usageSecondsThisPeriod} capSeconds={usage.capSeconds} />
            <div className="mt-4">
              <ButtonLink href="/dashboard/usage" variant="secondary">View usage</ButtonLink>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-base font-bold">Widget status</h2>
            <Badge tone={hasOrigin && hasPublishableKey ? "green" : "amber"}>
              {hasOrigin && hasPublishableKey ? "Ready to test" : "Needs setup"}
            </Badge>
            <p className="mt-3 text-sm text-neutral-400">
              {hasOrigin && hasPublishableKey
                ? "Your tenant can mint Realtime tokens from approved origins."
                : "Add an origin and create a publishable key before embedding."}
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
