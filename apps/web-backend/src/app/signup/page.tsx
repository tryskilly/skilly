import { isWorkOSDashboardAuthConfigured } from "@/lib/dashboardAuth";
import { AuthMarketingPanel, Footer, LogoMark, type AuthSlide } from "../dashboard/v2";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Create a workspace · Skilly",
  description: "Create your Skilly workspace and teach your users directly inside your product.",
};

const signupErrorMessages: Record<string, string> = {
  magic_email: "Enter a valid email address.",
  magic_start: "We could not send an email code. Try again.",
  magic_expired: "The email code expired. Start again with your email.",
  no_membership: "We could not create your workspace. Try again.",
  workos: "WorkOS signup failed. Try again.",
  workos_unconfigured: "WorkOS signup is not configured yet.",
};

// Left-panel slideshow: signup-specific beats. The first slide previews the real
// 4-step onboarding journey (company → install → skill → test); the others are
// benefit-led ("what you get once you're live"). Each rotates as a slideshow.
const signupSlides: AuthSlide[] = [
  {
    kind: "steps",
    eyebrow: "Setup in four steps",
    headline: ["From signup to live", "in minutes."],
    body: "Create a workspace, install one script, teach your skill, and test — all before going live. Here's the journey you're about to start:",
    steps: [
      { label: "Create your workspace", description: "Name your team and you're in." },
      { label: "Install the widget", description: "One script tag on any web app." },
      { label: "Author your SKILL.md", description: "Teach Skilly your product." },
      { label: "Test it live", description: "See the cursor point and explain." },
    ],
  },
  {
    kind: "steps",
    eyebrow: "Onboarding that teaches itself",
    headline: ["Your users never", "get stuck again."],
    body: "Once you're live, Skilly watches the page, points at the next click, and explains it out loud — like a patient expert beside every visitor.",
    steps: [
      { label: "Sees the page", description: "Reads the live UI in real time." },
      { label: "Points at clicks", description: "Cursor flies to the next action." },
      { label: "Speaks aloud", description: "Voice guidance, step by step." },
      { label: "Answers questions", description: "Context-aware, on-brand help." },
    ],
  },
  {
    kind: "steps",
    eyebrow: "Install once",
    headline: ["One script.", "Every page guided."],
    body: "Drop the widget into any site and Skilly handles onboarding, support, and feature walkthroughs across your entire product — not just one flow.",
    steps: [
      { label: "Drop in the script", description: "No framework, no build step." },
      { label: "Allowed origins", description: "Lock it to your domains." },
      { label: "Per-page skills", description: "Different teaching per route." },
      { label: "Usage & health", description: "Track sessions in the dashboard." },
    ],
  },
];

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/onboarding") ? params.next : "/onboarding/company";
  const workosConfigured = isWorkOSDashboardAuthConfigured();
  // intent=signup makes the WorkOS callback create a fresh tenant + super_admin
  // membership for brand-new users, then route to onboarding.
  const googleUrl = `/api/auth/workos/start?method=google&intent=signup&next=${encodeURIComponent(nextPath)}`;
  const errorMessage = params.error ? signupErrorMessages[params.error] : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="grid flex-1 lg:grid-cols-[1fr_460px] lg:items-center lg:gap-6 lg:px-6">
        {/* Left — rotating marketing slideshow (onboarding journey preview) */}
        <AuthMarketingPanel slides={signupSlides} />

        {/* Right — signup card */}
        <main className="mx-auto flex w-full max-w-md flex-col px-4 py-10 lg:mx-0 lg:max-w-none lg:px-0">
          <section className="rounded-[20px] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.035))] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.48)]">
            <div className="mb-7 flex items-center gap-3">
              <LogoMark size={40} />
              <div>
                <h1 className="text-2xl font-bold tracking-[-0.035em] text-gray-100">Create your workspace</h1>
                <p className="text-sm text-muted">Free to start. No credit card.</p>
              </div>
            </div>

            {!workosConfigured && (
              <div className="mb-4 rounded-[12px] border border-amber-500/30 bg-amber-500/15 p-3 text-sm text-amber-200">
                Self-serve signup needs WorkOS configured. Ask a platform admin to provision your workspace, or set the
                WorkOS dashboard auth variables.
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 rounded-[12px] border border-amber-500/30 bg-amber-500/15 p-3 text-sm text-amber-200">
                {errorMessage}
              </div>
            )}

            {workosConfigured && (
              <div className="grid gap-3">
                {/* Email is the primary signup path; carries intent=signup so the
                    callback provisions the tenant + routes to onboarding. */}
                <form action="/api/auth/workos/magic/start" method="post" className="grid gap-3">
                  <input type="hidden" name="next" value={nextPath} />
                  <input type="hidden" name="intent" value="signup" />
                  <label className="grid gap-[7px]">
                    <span className="text-xs font-bold text-gray-300">Work email</span>
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="w-full rounded-[10px] border border-line bg-white/[0.045] px-[11px] py-[10px] text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-amber-500/55 focus:ring-[3px] focus:ring-amber-500/12"
                    />
                  </label>
                  <button
                    type="submit"
                    className="inline-flex h-[42px] items-center justify-center gap-2 rounded-[9px] border border-white/12 bg-amber-500 px-4 text-sm font-bold text-gray-950 shadow-[0_10px_24px_rgba(245,158,11,0.16)] transition hover:bg-amber-600 active:scale-[0.98]"
                  >
                    Create workspace
                  </button>
                </form>

                {/* Divider */}
                <div className="my-1 flex items-center gap-3 text-xs text-muted">
                  <span className="h-px flex-1 bg-line-soft" />
                  or
                  <span className="h-px flex-1 bg-line-soft" />
                </div>

                {/* Google as the secondary path (also carries intent=signup). */}
                <a
                  href={googleUrl}
                  className="flex h-[42px] items-center justify-center gap-2 rounded-[9px] border border-white/[0.11] bg-white/[0.055] px-4 text-center text-sm font-bold text-gray-200 transition hover:bg-white/[0.085] active:scale-[0.98]"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
                  </svg>
                  Continue with Google
                </a>

                <p className="text-center text-xs text-muted">
                  Already have a workspace?{" "}
                  <a href="/login" className="font-bold text-amber-300 underline underline-offset-2 hover:text-amber-200">
                    Sign in
                  </a>
                </p>
              </div>
            )}
          </section>
        </main>
      </div>
      <Footer variant="auth" />
    </div>
  );
}
