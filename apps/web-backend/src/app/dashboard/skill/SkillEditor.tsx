"use client";

import { useActionState } from "react";
import { saveSkillAction, type SaveSkillState } from "../actions";
import { FormButton } from "../ui";

export function SkillEditor({ initialContent }: { initialContent: string }) {
  const [state, save, saving] = useActionState<SaveSkillState, FormData>(saveSkillAction, {});

  return (
    <form action={save}>
      <textarea
        name="content"
        defaultValue={initialContent}
        rows={16}
        placeholder="# My Product&#10;&#10;Guide the user through their first task..."
        className="min-h-[420px] w-full rounded-xl border border-white/10 bg-neutral-950 p-4 font-mono text-sm leading-relaxed text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-amber-500/80"
      />
      <div className="mt-3 flex items-center gap-3">
        <FormButton analyticsEvent="dashboard_skill_save_clicked" analyticsLabel="Validate and save" disabled={saving}>
          {saving ? "Saving..." : "Validate and save"}
        </FormButton>
        {state.ok && <span className="text-sm font-bold text-green-300">Saved</span>}
      </div>

      {state.issues && state.issues.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-red-800/50 bg-red-950/40 p-3 text-sm text-red-300">
          {state.issues.map((issue) => (
            <li key={issue}>• {issue}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
