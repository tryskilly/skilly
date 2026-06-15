import { isDashboardAuthConfigured, isWorkOSDashboardAuthConfigured } from "@/lib/dashboardAuth";
import { CursorGlyph, LogoMark } from "../dashboard/v2";

export const dynamic = "force-dynamic";

const loginErrorMessages: Record<string, string> = {
  invalid: "The password did not match.",
  magic_email: "Enter a valid email address.",
  magic_start: "We could not send an email code. Try again.",
  magic_expired: "The email code expired. Start again with your email.",
  no_membership: "Your WorkOS account is not mapped to a Skilly tenant yet.",
  workos_state: "The sign-in session expired. Try signing in again.",
  workos: "WorkOS sign-in failed. Try again or use the fallback password.",
  workos_unconfigured: "WorkOS sign-in is not configured yet. Use the fallback password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/dashboard") ? params.next : "/dashboard";
  const error = params.error;
  const configured = isDashboardAuthConfigured();
  const workosConfigured = isWorkOSDashboardAuthConfigured();
  const googleUrl = `/api/auth/workos/start?method=google&next=${encodeURIComponent(nextPath)}`;
  const errorMessage = error ? loginErrorMessages[error] : null;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[460px_1fr] lg:items-center lg:gap-6 lg:px-6">
      {/* Left — auth card */}
      <main className="mx-auto flex w-full max-w-md flex-col px-4 py-10 lg:mx-0 lg:max-w-none lg:px-0">
        <section className="rounded-[20px] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.035))] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.48)]">
          <div className="mb-6 flex items-center gap-3">
            <LogoMark size={40} />
            <div>
              <h1 className="text-2xl font-bold tracking-[-0.035em] text-gray-100">Sign in to Skilly</h1>
              <p className="text-sm text-muted">Manage tenants, keys, skills, and usage.</p>
            </div>
          </div>

          {!workosConfigured && !configured && (
            <div className="mb-4 rounded-[12px] border border-error/30 bg-error/15 p-3 text-sm text-[#fca5a5]">
              Dashboard auth is not configured. Set WorkOS dashboard auth variables before using production.
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-[12px] border border-amber-500/30 bg-amber-500/15 p-3 text-sm text-amber-200">
              {errorMessage}
            </div>
          )}

          {workosConfigured && (
            <div className="grid gap-3">
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
              <form action="/api/auth/workos/magic/start" method="post" className="grid gap-3">
                <input type="hidden" name="next" value={nextPath} />
                <label className="grid gap-[7px]">
                  <span className="text-xs font-bold text-gray-300">Email</span>
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
                  className="inline-flex h-[42px] items-center justify-center gap-2 rounded-[9px] border border-white/[0.11] bg-white/[0.055] px-[13px] text-sm font-bold text-gray-200 transition hover:bg-white/[0.085] active:scale-[0.98]"
                >
                  Continue with email
                </button>
              </form>
            </div>
          )}

          {configured && (
            <details className="mt-5 rounded-[12px] border border-line bg-black/15 p-4">
              <summary className="cursor-pointer text-sm font-bold text-gray-300">Use emergency password</summary>
              <form action="/api/dashboard/login" method="post" className="mt-4 grid gap-4">
                <input type="hidden" name="next" value={nextPath} />
                <label className="grid gap-[7px]">
                  <span className="text-xs font-bold text-gray-300">Password</span>
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    className="w-full rounded-[10px] border border-line bg-white/[0.045] px-[11px] py-[10px] text-sm text-gray-200 outline-none transition focus:border-amber-500/55 focus:ring-[3px] focus:ring-amber-500/12"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex h-[42px] items-center justify-center gap-2 rounded-[9px] border border-white/[0.11] bg-white/[0.055] px-[13px] text-sm font-bold text-gray-200 transition hover:bg-white/[0.085] active:scale-[0.98]"
                >
                  Sign in with password
                </button>
              </form>
            </details>
          )}

          {!process.env.SKILLY_DASHBOARD_PASSWORD && process.env.NODE_ENV !== "production" && (
            <p className="mt-4 text-xs text-muted">
              Local default password: <span className="font-mono text-gray-300">skilly-local</span>
            </p>
          )}

          <p className="mt-6 text-center text-xs text-muted">
            New to Skilly?{" "}
            <a href="/signup" className="font-bold text-amber-300 underline underline-offset-2 hover:text-amber-200">
              Create a workspace
            </a>
          </p>
        </section>
      </main>

      {/* Right — product preview panel */}
      <aside className="hidden min-h-[520px] items-center justify-center overflow-hidden rounded-[24px] border border-line bg-[radial-gradient(circle_at_50%_20%,rgba(245,158,11,0.16),transparent_26rem),rgba(255,255,255,0.035)] p-6 lg:flex">
        <div className="relative max-w-sm text-center">
          <div className="mx-auto mb-6 flex justify-center">
            <CursorGlyph size={64} />
          </div>
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-gray-100">Teach users directly inside your product.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Skilly sees the page, points at the next action, and explains it out loud. Install once with a single script.
          </p>
          <div className="mt-6 rounded-[14px] border border-line bg-gray-900/60 p-4 text-left shadow-[0_30px_80px_rgba(0,0,0,0.48)]">
            <div className="flex items-center gap-1.5 pb-2">
              <span className="h-2 w-2 rounded-full bg-white/22" />
              <span className="h-2 w-2 rounded-full bg-white/22" />
              <span className="h-2 w-2 rounded-full bg-white/22" />
            </div>
            <div className="space-y-2 pt-1">
              <div className="h-2.5 w-[70%] rounded-full bg-white/[0.08]" />
              <div className="h-2.5 w-[90%] rounded-full bg-white/[0.08]" />
              <div className="mt-2 rounded-[8px] border border-amber-500/35 bg-amber-500/[0.06] p-2">
                <span className="text-xs font-bold text-amber-300">Create project</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
