import Link from "next/link";

export default function PublicPrivacyPage() {
  return (
    <main className="min-h-dvh bg-[#0b0a08] px-6 py-12 text-gray-100">
      <div className="mx-auto max-w-3xl">
        <Link href="/login" className="text-sm font-bold text-amber-300">
          Skilly Studio
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.03em]">Privacy</h1>
        <div className="mt-5 space-y-4 text-sm leading-relaxed text-gray-400">
          <p>Skilly Studio stores workspace configuration, project skill content, allowed surfaces, team memberships, and usage metadata needed to run the widget and dashboard.</p>
          <p>Provider secrets stay server-side. Browser and native clients receive scoped, short-lived credentials only after backend checks pass.</p>
        </div>
      </div>
    </main>
  );
}
