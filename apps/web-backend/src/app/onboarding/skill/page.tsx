import { getRepo } from "@/db";
import { getCurrentDashboardTenantId } from "@/lib/session";
import { getDashboardSkillSelection } from "@/lib/dashboardSkill";
import { Panel, PanelBody, PanelHeader } from "@/app/dashboard/v2";
import { OnboardingSkillEditor } from "./OnboardingSkillEditor";
import { OnboardingStepFooter } from "../shared";

export const dynamic = "force-dynamic";

// Starter templates (spec §5.6). Selecting one seeds the editor.
const TEMPLATES: Array<{ id: string; label: string; content: string }> = [
  {
    id: "onboarding",
    label: "Product onboarding",
    content: "# Product\nDescribe your product in 1-2 sentences.\n\n# Assistant behavior\n- Be concise and supportive.\n- Explain the current page before giving instructions.\n- Point to visible UI elements when it helps the user act.\n\n# Common tasks\n- Help new users complete their first key task.\n- Explain settings and permissions.",
  },
  {
    id: "support",
    label: "Support assistant",
    content: "# Product\nDescribe your product.\n\n# Assistant behavior\n- Answer questions about how to use the product.\n- Point to the relevant setting or action.\n- Escalate billing/account issues to support.\n\n# Common questions\n- How do I change my password?\n- Where are my billing settings?",
  },
  {
    id: "walkthrough",
    label: "Feature walkthrough",
    content: "# Feature\nDescribe the feature this skill teaches.\n\n# Assistant behavior\n- Walk the user through the feature one step at a time.\n- Point to each control before explaining it.\n- Confirm understanding before moving on.\n\n# Steps\n1. Step one\n2. Step two\n3. Step three",
  },
];

export default async function OnboardingSkillPage() {
  const repo = getRepo();
  const { skill } = await getDashboardSkillSelection(repo, await getCurrentDashboardTenantId());

  return (
    <>
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-wide text-amber-300">Step 3 of 4</div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-gray-100">Teach Skilly your product</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          The SKILL.md becomes Skilly&apos;s companion instructions. Pick a template, edit it, and validate before continuing.
        </p>
      </div>

      <Panel>
        <PanelHeader title="SKILL.md editor" description="Pick a template to seed the editor, then customize." />
        <PanelBody>
          <OnboardingSkillEditor initialContent={skill?.content ?? TEMPLATES[0]!.content} templates={TEMPLATES} />
        </PanelBody>
      </Panel>

      <OnboardingStepFooter currentStep={3} nextHref="/onboarding/test" />
    </>
  );
}
