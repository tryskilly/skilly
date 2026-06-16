"use client";

import { CursorGlyph } from "./v2";

/**
 * Segment error boundary for /dashboard/**. Catches runtime errors in any
 * dashboard page (e.g. a repo failure) and offers a recovery affordance
 * instead of the raw Next error page (spec §11 #13).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex justify-center">
          <CursorGlyph size={48} />
        </div>
        <h1 className="text-xl font-bold text-gray-100">This page hit a snag</h1>
        <p className="mt-2 text-sm text-gray-400">
          We couldn&apos;t load this section. Try again, or head back to the overview.
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
            Overview
          </a>
        </div>
      </section>
    </main>
  );
}
