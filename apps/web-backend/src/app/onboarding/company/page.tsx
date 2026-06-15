import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { onboardingCompanyAction } from "../actions";
import { Button, Field, Panel, PanelBody, PanelHeader } from "@/app/dashboard/v2";
import { OnboardingStepFooter } from "../shared";

export const dynamic = "force-dynamic";

export default async function OnboardingCompanyPage() {
  const tenantId = await getCurrentDashboardTenantId();
  const tenant = await getRepo().getTenant(tenantId);

  return (
    <>
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-wide text-amber-300">Step 1 of 4</div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-gray-100">Create your workspace</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Name your workspace. This is how Skilly refers to your tenant — you can change it later in settings.
        </p>
      </div>

      <Panel>
        <PanelHeader title="Workspace details" description="Your tenant was auto-created at signup. Give it a real name." />
        <PanelBody>
          <form action={onboardingCompanyAction} className="grid gap-4">
            <Field name="name" label="Company / workspace name" defaultValue={tenant?.name ?? ""} placeholder="Acme Inc." />
            <Field name="website" label="Website (optional)" type="url" placeholder="https://acme.com" helper="Helps Skilly understand your product context." />
            <div>
              <Button variant="primary" analyticsEvent="onboarding_company_continue" analyticsLabel="Continue to install">
                Continue to install
              </Button>
            </div>
          </form>
        </PanelBody>
      </Panel>

      <OnboardingStepFooter currentStep={1} nextHref="/onboarding/install" />
    </>
  );
}
