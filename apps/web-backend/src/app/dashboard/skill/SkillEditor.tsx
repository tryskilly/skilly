"use client";

import { useActionState } from "react";
import { saveSkillAction, type SaveSkillState } from "../actions";
import { Button } from "../v2";

/** SKILL.md editor (v2). Mono editor + validate-and-save with issue list. */
export function SkillEditor({ initialContent }: { initialContent: string }) {
  const [state, save, saving] = useActionState<SaveSkillState, FormData>(saveSkillAction, {});

  return (
    <form action={save}>
      <div className="overflow-hidden rounded-[14px] border border-line bg-[#111112]">
        <div className="flex h-[42px] items-center justify-between border-b border-line-soft px-3 text-muted">
          <span className="font-mono text-xs">SKILL.md</span>
          <span className="text-xs">JetBrains Mono</span>
        </div>
        <textarea
          name="content"
          defaultValue={initialContent}
          rows={20}
          spellCheck={false}
          placeholder={"# My Product\n\nGuide the user through their first task..."}
          className="min-h-[460px] w-full resize-y border-0 bg-transparent p-4 font-mono text-[13px] leading-relaxed text-gray-200 outline-none placeholder:text-gray-600"
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" analyticsEvent="dashboard_skill_save_clicked" analyticsLabel="Validate and save" disabled={saving}>
          {saving ? "Validating…" : "Validate and save"}
        </Button>
        {state.ok && <span className="text-sm font-bold text-success">Saved</span>}
      </div>

      {state.issues && state.issues.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-[12px] border border-error/30 bg-error/10 p-3 text-sm text-[#fca5a5]">
          {state.issues.map((issue) => (
            <li key={issue}>• {issue}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
