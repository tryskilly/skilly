"use client";

import { useActionState } from "react";
import { saveSkillAction, type SaveSkillState } from "../actions";

export function SkillEditor({ initialContent }: { initialContent: string }) {
  const [state, save, saving] = useActionState<SaveSkillState, FormData>(saveSkillAction, {});

  return (
    <form action={save} className="mt-6">
      <textarea
        name="content"
        defaultValue={initialContent}
        rows={16}
        placeholder="# My Product&#10;&#10;Guide the user through their first task…"
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Validate & save"}
        </button>
        {state.ok && <span className="text-sm text-green-400">Saved ✓</span>}
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
