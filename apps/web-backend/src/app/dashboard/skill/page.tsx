import Link from "next/link";
import { getRepo } from "@/db";
import { DEFAULT_SKILL_ID, getCurrentTenantId } from "@/lib/session";
import { SkillEditor } from "./SkillEditor";

export const dynamic = "force-dynamic";

export default async function SkillPage() {
  const skill = await getRepo().getTenantSkill(getCurrentTenantId(), DEFAULT_SKILL_ID);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← Dashboard
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Teaching skill</h1>
      <p className="mt-2 text-sm text-neutral-400">
        This SKILL.md is composed into your companion&apos;s instructions, after a safety scan.
      </p>
      <SkillEditor initialContent={skill?.content ?? ""} />
    </main>
  );
}
