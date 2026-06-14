import { isDashboardAuthConfigured, isWorkOSDashboardAuthConfigured } from "@/lib/dashboardAuth";
import { SkillyMark } from "../dashboard/ui";

export const dynamic = "force-dynamic";

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
  const emailUrl = `/api/auth/workos/start?method=email&next=${encodeURIComponent(nextPath)}`;
  const errorMessage =
    error === "invalid"
      ? "The password did not match."
      : error === "no_membership"
        ? "Your WorkOS account is not mapped to a Skilly tenant yet."
        : error === "workos_state"
        ? "The sign-in session expired. Try signing in again."
        : error === "workos"
          ? "WorkOS sign-in failed. Try again or use the fallback password."
          : error === "workos_unconfigured"
            ? "WorkOS sign-in is not configured yet. Use the fallback password."
            : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_50%_-20%,rgba(245,158,11,0.16),transparent_34%),#0F0F10] px-4 text-neutral-100">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
        <div className="mb-6 flex items-center gap-3">
          <SkillyMark size={40} />
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
              <span className="grid size-5 place-items-center rounded-full bg-white text-xs font-black text-neutral-950">
                G
              </span>
              Continue with Google
            </a>
            <a
              href={emailUrl}
              className="block rounded-md border border-white/15 px-4 py-2.5 text-center text-sm font-bold text-neutral-100 transition hover:border-amber-500/60 active:scale-[0.98]"
            >
              Continue with email
            </a>
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
