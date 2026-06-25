"use client";

/**
 * Root error boundary (Next.js). Catches errors that the segment-level error.tsx
 * cannot — including errors in the root layout itself. Must render its own
 * <html>/<body>. Kept dependency-free so it works even if the app bundle is broken.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 font-sans text-gray-200 antialiased">
        <main className="grid min-h-screen place-items-center px-4">
          <section className="w-full max-w-md rounded-[20px] border border-white/10 bg-white/[0.04] p-8 text-center">
            <h1 className="text-xl font-bold text-gray-100">Something went wrong</h1>
            <p className="mt-2 text-sm text-gray-400">
              An unexpected error occurred. You can try again, or refresh the page.
            </p>
            {error.digest && (
              <p className="mt-3 font-mono text-xs text-gray-600">Reference: {error.digest}</p>
            )}
            <div className="mt-6 flex justify-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-[38px] items-center rounded-[9px] border border-white/12 bg-amber-500 px-4 text-sm font-bold text-gray-950 transition hover:bg-amber-600"
              >
                Try again
              </button>
              <a
                href="/dashboard"
                className="inline-flex h-[38px] items-center rounded-[9px] border border-white/[0.11] bg-white/[0.055] px-4 text-sm font-bold text-gray-200 transition hover:bg-white/[0.085]"
              >
                Go to dashboard
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
