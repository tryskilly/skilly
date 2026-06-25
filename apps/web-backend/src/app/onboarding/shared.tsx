import Link from "next/link";
import { ButtonLink } from "@/app/dashboard/v2";

/** Total onboarding steps (spec §5.4: company → install → skill → test). */
const TOTAL_STEPS = 4;

const STEP_PATHS = ["", "/onboarding/company", "/onboarding/install", "/onboarding/skill", "/onboarding/test"];

/**
 * Footer shown on every onboarding step: a 4-dot progress indicator plus a
 * "skip for now" link to the next step. Keeps the flow un-blocking — each step
 * is optional except the test step's final CTA.
 */
export function OnboardingStepFooter({
  currentStep,
  nextHref,
}: {
  currentStep: number;
  nextHref: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        {Array.from({ length: TOTAL_STEPS }, (_, index) => {
          const step = index + 1;
          const done = step < currentStep;
          const active = step === currentStep;
          return (
            <span
              key={step}
              className={`h-2 w-2 rounded-full ${active ? "bg-amber-400" : done ? "bg-amber-500/50" : "bg-white/[0.12]"}`}
            />
          );
        })}
        <span className="ml-2 text-xs text-muted">
          Step {currentStep} of {TOTAL_STEPS}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {currentStep > 1 && (
          <Link
            href={STEP_PATHS[currentStep - 1]!}
            className="text-xs text-muted transition hover:text-gray-200"
          >
            ← Back
          </Link>
        )}
        <ButtonLink href={nextHref} variant="secondary" analyticsEvent="onboarding_skip_step" analyticsLabel={`Skip step ${currentStep}`}>
          Skip for now
        </ButtonLink>
      </div>
    </div>
  );
}
