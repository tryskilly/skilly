import Link from "next/link";

export default function PublicDocsPage() {
  return (
    <main className="min-h-dvh bg-[#0b0a08] px-6 py-12 text-gray-100">
      <div className="mx-auto max-w-3xl">
        <Link href="/login" className="text-sm font-bold text-amber-300">
          Skilly Studio
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.03em]">Docs</h1>
        <p className="mt-3 text-gray-400">
          Studio docs live inside the authenticated dashboard so they can reflect your active project, keys, allowed surfaces, and install snippet.
        </p>
        <Link
          href="/dashboard/docs"
          className="mt-6 inline-flex h-[38px] items-center rounded-[9px] bg-amber-500 px-[13px] text-sm font-bold text-gray-950"
        >
          Open dashboard docs
        </Link>
      </div>
    </main>
  );
}
