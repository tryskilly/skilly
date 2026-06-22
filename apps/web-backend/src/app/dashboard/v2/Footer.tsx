import Link from "next/link";

/*
 * Slim app footer (the missing footer). Lives at the bottom of the dashboard
 * content canvas and the auth pages. Quiet, informational — not a marketing
 * CTA. Links resolve internally where possible.
 */
export function Footer({ variant = "dashboard" }: { variant?: "dashboard" | "auth" }) {
  const year = new Date().getFullYear();
  const docsHref = variant === "auth" ? "/docs" : "/dashboard/docs";
  const statusHref = variant === "auth" ? "/status" : "/dashboard/status";
  const privacyHref = variant === "auth" ? "/privacy" : "/dashboard/privacy";
  const termsHref = variant === "auth" ? "/terms" : "/dashboard/privacy";

  return (
    <footer className="skilly-dashboard-footer shrink-0 border-t border-line-soft px-4 py-4 md:px-8">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Link href={docsHref} className="transition hover:text-gray-200">
            Docs
          </Link>
          <span className="text-white/15">·</span>
          <Link href={statusHref} className="transition hover:text-gray-200">
            Status
          </Link>
          <span className="text-white/15">·</span>
          <Link href={privacyHref} className="transition hover:text-gray-200">
            Privacy
          </Link>
          {variant === "auth" && (
            <>
              <span className="text-white/15">·</span>
              <Link href={termsHref} className="transition hover:text-gray-200">
                Terms
              </Link>
            </>
          )}
        </div>
        <div className="text-gray-500">© {year} Skilly · tryskilly.app</div>
      </div>
    </footer>
  );
}
