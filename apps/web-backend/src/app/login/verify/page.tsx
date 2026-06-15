import { LogoMark } from "../../dashboard/v2";

export const dynamic = "force-dynamic";

export default async function VerifyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; intent?: string; next?: string }>;
}) {
  const params = await searchParams;
  const isSignup = params.intent === "signup";
  const nextPath = isSignup
    ? params.next?.startsWith("/onboarding")
      ? params.next
      : "/onboarding/company"
    : params.next?.startsWith("/dashboard")
      ? params.next
      : "/dashboard";
  const error = params.error;
  const errorMessage =
    error === "magic_code"
      ? "That code did not work. Check the email and try again."
      : error === "magic_expired"
        ? "The email code expired. Start again with your email."
        : error === "no_membership"
          ? "Your WorkOS account is not mapped to a Skilly tenant yet."
          : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_50%_-20%,rgba(245,158,11,0.16),transparent_34%),#0F0F10] px-4 text-neutral-100">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.035em]">Check your email</h1>
            <p className="text-sm text-neutral-500">Enter the six-digit WorkOS code to continue.</p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/15 p-3 text-sm text-amber-200">
            {errorMessage}
          </div>
        )}

        <form action="/api/auth/workos/magic/verify" method="post" className="grid gap-4">
          <input type="hidden" name="next" value={nextPath} />
          {isSignup && <input type="hidden" name="intent" value="signup" />}
          <label className="grid gap-1.5">
            <span className="text-sm font-bold text-neutral-300">Code</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-center font-mono text-lg tracking-[0.24em] text-neutral-100 outline-none transition focus:border-amber-500/80"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-amber-500 px-4 py-2.5 text-sm font-bold text-neutral-950 transition hover:bg-amber-600 active:scale-[0.98]"
          >
            Continue
          </button>
        </form>

        <a
          href={`${isSignup ? "/signup" : "/login"}?next=${encodeURIComponent(nextPath)}`}
          className="mt-5 block text-center text-sm font-bold text-neutral-400 transition hover:text-neutral-100"
        >
          Use a different email
        </a>
      </section>
    </main>
  );
}
