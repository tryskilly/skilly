import Link from "next/link";

export default function PublicPrivacyPage() {
  return (
    <main className="min-h-dvh bg-[#0b0a08] px-6 py-12 text-gray-100">
      <div className="mx-auto max-w-3xl">
        <Link href="/login" className="text-sm font-bold text-amber-300">
          Skilly Studio
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.03em]">Privacy</h1>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
          Last updated August 2, 2026
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-gray-400">
          <section>
            <h2 className="text-base font-bold text-gray-100">What Skilly processes</h2>
            <p className="mt-2">
              Skilly processes the information needed to provide its AI tutoring features across
              the macOS app, browser extension, web companion, and Studio dashboard. This includes
              account identifiers such as your user ID and email address, authentication tokens,
              subscription and entitlement status, usage duration, workspace configuration,
              project skill content, allowed surfaces, and team memberships.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-100">Browser extension data</h2>
            <p className="mt-2">
              When you start a tutoring session, the extension creates a structured digest of the
              active page so Skilly can understand and point to interface controls. The digest may
              include the page URL and title, visible element labels, roles, text, and positions,
              including content in frames. Skilly does not capture a screenshot for this browser
              digest. Page information is processed only to provide the session you requested.
            </p>
            <p className="mt-2">
              If you enable voice, microphone audio is sent over an encrypted WebRTC connection to
              the AI service for realtime transcription and responses. Assistant text and audio are
              handled during the active session. The extension stores its scoped session token,
              account email, and selected skill locally in your browser so it can stay signed in and
              remember your choice.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-100">How information is used</h2>
            <p className="mt-2">
              Information is used to authenticate you, enforce plan limits, deliver tutoring,
              generate responses and pointing actions, remember configuration, operate the
              dashboard, prevent abuse, and maintain service reliability. Skilly does not sell this
              information or use it for targeted advertising.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-100">Service providers and security</h2>
            <p className="mt-2">
              Skilly sends data only to service providers needed to operate the requested feature,
              including authentication, hosting, billing, and AI processing providers. Provider API
              keys remain server-side. Browser and native clients receive scoped, short-lived
              credentials only after backend checks pass, and data is transmitted over encrypted
              connections.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-100">Retention and your choices</h2>
            <p className="mt-2">
              Account, entitlement, usage, and workspace records are retained while needed to
              operate the service and meet legal or security obligations. Realtime page context and
              model output are not stored by the extension after the session. Signing out clears the
              extension&apos;s locally stored session information. You can revoke microphone or site
              access at any time in your browser or operating-system settings.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-100">Contact</h2>
            <p className="mt-2">
              For privacy questions or requests concerning your account data, email{" "}
              <a className="font-semibold text-amber-300 hover:text-amber-200" href="mailto:support@tryskilly.app">
                support@tryskilly.app
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
