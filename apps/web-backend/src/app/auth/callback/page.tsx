import { LogoMark } from "../../dashboard/v2";

export const dynamic = "force-dynamic";

/**
 * Branded loading state for the WorkOS handoff (spec §5.3). The real code
 * exchange happens in the API callback route (/api/auth/workos/callback); this
 * page is the visual the browser may flash while redirecting. Visitors who land
 * here directly with no pending auth see a calm "try again" prompt.
 */
export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const failed = Boolean(params.error);

  return (
    <main className="grid min-h-dvh place-items-center bg-gray-950 px-4">
      <section className="w-full max-w-sm rounded-[20px] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.035))] p-7 text-center shadow-[0_30px_80px_rgba(0,0,0,0.48)]">
        <div className="mx-auto mb-5 flex justify-center">
          <LogoMark size={40} />
        </div>

        {failed ? (
          <>
            <h1 className="text-lg font-bold text-gray-100">We couldn&apos;t finish sign-in.</h1>
            <p className="mt-2 text-sm text-muted">
              Try again or contact support if this keeps happening.
            </p>
            <a
              href="/login"
              className="mt-5 inline-flex h-[42px] items-center justify-center rounded-[9px] border border-white/12 bg-amber-500 px-4 text-sm font-bold text-gray-950 transition hover:bg-amber-600 active:scale-[0.98]"
            >
              Back to sign in
            </a>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-gray-100">Setting up your Skilly workspace…</h1>
            <p className="mt-2 text-sm text-muted">Just a moment while we finish signing you in.</p>
            {/* Amber shimmer bar (respects reduced motion via the animation). */}
            <div className="mx-auto mt-5 h-1 w-32 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[linear-gradient(90deg,var(--color-amber-300),var(--color-amber-500))]" />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
