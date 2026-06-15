import Link from "next/link";

/*
 * Slim app footer (the missing footer). Lives at the bottom of the dashboard
 * content canvas and the auth pages. Quiet, informational — not a marketing
 * CTA. Links resolve internally where possible.
 */
export function Footer({ variant = "dashboard" }: { variant?: "dashboard" | "auth" }) {
  const year = new Date().getFullYear();
  const docsHref = variant === "auth" ? "/login" : "/dashboard/install";

  return (
    <footer className="border-t border-line-soft px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Link href={docsHref} className="transition hover:text-gray-200">
            Docs
          </Link>
          <span className="text-white/15">·</span>
          <a
            href="https://status.tryskilly.app"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-gray-200"
          >
            Status
          </a>
          <span className="text-white/15">·</span>
          <a
            href="https://tryskilly.app/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-gray-200"
          >
            Privacy
          </a>
          {variant === "auth" && (
            <>
              <span className="text-white/15">·</span>
              <a
                href="https://tryskilly.app/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-gray-200"
              >
                Terms
              </a>
            </>
          )}
        </div>
        <div className="text-gray-500">© {year} Skilly · tryskilly.app</div>
      </div>
    </footer>
  );
}
