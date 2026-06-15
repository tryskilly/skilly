import { isDashboardAuthConfigured, isWorkOSDashboardAuthConfigured } from "@/lib/dashboardAuth";
import { LogoMark } from "../dashboard/v2";

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
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_50%_-20%,rgba(245,158,11,0.16),transparent_34%),#0F0F10] px-4 text-neutral-100">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.035em]">Skilly Dashboard</h1>
            <p className="text-sm text-neutral-500">Sign in to manage tenants, keys, skills, and usage.</p>
          </div>
        </div>

        {!workosConfigured && !configured && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/15 p-3 text-sm text-red-200">
            Dashboard auth is not configured. Set WorkOS dashboard auth variables before using production.
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/15 p-3 text-sm text-amber-200">
            {errorMessage}
          </div>
        )}

        {workosConfigured && (
          <div className="grid gap-3">
            <a
              href={googleUrl}
              className="flex items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2.5 text-center text-sm font-bold text-neutral-950 transition hover:bg-amber-600 active:scale-[0.98]"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"
                />
              </svg>
              Continue with Google
            </a>
            <form action="/api/auth/workos/magic/start" method="post" className="grid gap-3">
              <input type="hidden" name="next" value={nextPath} />
              <label className="grid gap-1.5">
                <span className="text-sm font-bold text-neutral-300">Email</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-sm text-neutral-100 outline-none transition focus:border-amber-500/80"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-white/15 px-4 py-2.5 text-sm font-bold text-neutral-100 transition hover:border-amber-500/60 active:scale-[0.98]"
              >
                Continue with email
              </button>
            </form>
          </div>
        )}

        {configured && (
          <details className="mt-5 rounded-lg border border-white/10 bg-black/15 p-4">
            <summary className="cursor-pointer text-sm font-bold text-neutral-300">Use emergency password</summary>
            <form action="/api/dashboard/login" method="post" className="mt-4 grid gap-4">
              <input type="hidden" name="next" value={nextPath} />
              <label className="grid gap-1.5">
                <span className="text-sm font-bold text-neutral-300">Password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-sm text-neutral-100 outline-none transition focus:border-amber-500/80"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-white/15 px-4 py-2.5 text-sm font-bold text-neutral-100 transition hover:border-amber-500/60 active:scale-[0.98]"
              >
                Sign in with password
              </button>
            </form>
          </details>
        )}

        {!process.env.SKILLY_DASHBOARD_PASSWORD && process.env.NODE_ENV !== "production" && (
          <p className="mt-4 text-xs text-neutral-500">
            Local default password: <span className="font-mono text-neutral-300">skilly-local</span>
          </p>
        )}
      </section>
    </main>
  );
}
