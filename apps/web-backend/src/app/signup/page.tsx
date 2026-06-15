import { isWorkOSDashboardAuthConfigured } from "@/lib/dashboardAuth";
import { CursorGlyph, LogoMark } from "../dashboard/v2";

export const dynamic = "force-dynamic";

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

  return (
    <div className="grid min-h-dvh lg:grid-cols-[460px_1fr] lg:items-center lg:gap-6 lg:px-6">
      {/* Left — signup card */}
      <main className="mx-auto flex w-full max-w-md flex-col px-4 py-10 lg:mx-0 lg:max-w-none lg:px-0">
        <section className="rounded-[20px] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.035))] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.48)]">
          <div className="mb-6 flex items-center gap-3">
            <LogoMark size={40} />
            <div>
              <h1 className="text-2xl font-bold tracking-[-0.035em] text-gray-100">Create your workspace</h1>
              <p className="text-sm text-muted">Sign up with WorkOS — we&apos;ll provision your tenant.</p>
            </div>
          </div>

          {!workosConfigured && (
            <div className="mb-4 rounded-[12px] border border-amber-500/30 bg-amber-500/15 p-3 text-sm text-amber-200">
              Self-serve signup needs WorkOS configured. Ask a platform admin to provision your workspace, or set the
              WorkOS dashboard auth variables.
            </div>
          )}

          {workosConfigured && (
            <div className="grid gap-3">
              <p className="text-sm text-muted">
                Continue with Google to create a new Skilly workspace. We&apos;ll set up your tenant and walk you through
                installing the widget and teaching your first skill.
              </p>
              <a
                href={googleUrl}
                className="flex h-[42px] items-center justify-center gap-2 rounded-[9px] border border-white/12 bg-amber-500 px-4 text-center text-sm font-bold text-gray-950 shadow-[0_10px_24px_rgba(245,158,11,0.16)] transition hover:bg-amber-600 active:scale-[0.98]"
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

      {/* Right — product preview panel */}
      <aside className="hidden min-h-[520px] items-center justify-center overflow-hidden rounded-[24px] border border-line bg-[radial-gradient(circle_at_50%_20%,rgba(245,158,11,0.16),transparent_26rem),rgba(255,255,255,0.035)] p-6 lg:flex">
        <div className="relative max-w-sm text-center">
          <div className="mx-auto mb-6 flex justify-center">
            <CursorGlyph size={64} />
          </div>
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-gray-100">From signup to live in minutes.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Create a workspace, install one script, teach your skill, and test — all before going live.
          </p>
          <ol className="mt-6 grid gap-2 text-left text-sm text-gray-300">
            <li className="rounded-[10px] border border-line-soft bg-white/[0.035] px-3 py-2">1. Create your workspace</li>
            <li className="rounded-[10px] border border-line-soft bg-white/[0.035] px-3 py-2">2. Install the widget script</li>
            <li className="rounded-[10px] border border-line-soft bg-white/[0.035] px-3 py-2">3. Teach Skilly your product</li>
            <li className="rounded-[10px] border border-line-soft bg-white/[0.035] px-3 py-2">4. Test before going live</li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
