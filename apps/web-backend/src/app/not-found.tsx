import Link from "next/link";
import { CursorGlyph, LogoMark } from "./dashboard/v2";

/**
 * Root 404 (Next.js). Shown for any unmatched route. Calm, branded, with a clear
 * path home — not the default Next "404 | This page could not be found."
 */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-gray-950 px-4">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex justify-center">
          <LogoMark size={40} />
        </div>
        <div className="mx-auto mb-5 flex justify-center">
          <CursorGlyph size={48} />
        </div>
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-gray-100">Page not found</h1>
        <p className="mt-2 text-sm text-gray-400">
          We couldn&apos;t find what you were looking for. It may have moved or never existed.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-[38px] items-center rounded-[9px] border border-white/12 bg-amber-500 px-4 text-sm font-bold text-gray-950 transition hover:bg-amber-600"
          >
            Go to dashboard
          </Link>
          <Link
            href="/login"
            className="inline-flex h-[38px] items-center rounded-[9px] border border-white/[0.11] bg-white/[0.055] px-4 text-sm font-bold text-gray-200 transition hover:bg-white/[0.085]"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
