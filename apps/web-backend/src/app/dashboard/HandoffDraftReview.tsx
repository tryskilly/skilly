"use client";

import { useEffect, useState } from "react";
import { SIGNUP_HANDOFF_STORAGE_KEY, parseStoredSignupHandoff, type SignupHandoff } from "@/lib/signupHandoff";
import { useRouter } from "next/navigation";
import { ButtonLink } from "./v2";

type State = { handoff: SignupHandoff | null; status: "idle" | "importing" | "saved" | "conflict" | "error"; message?: string };

export function HandoffDraftReview({ handoffPending = false }: { handoffPending?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ handoff: null, status: "idle" });
  const [unavailable, setUnavailable] = useState(handoffPending);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIGNUP_HANDOFF_STORAGE_KEY);
      if (!raw) {
        setUnavailable(new URLSearchParams(window.location.search).get("handoff") === "1");
        setMounted(true);
        return;
      }
      const validation = parseStoredSignupHandoff(raw);
      if (validation.ok && validation.value) setState({ handoff: validation.value, status: "idle" });
      else {
        try { localStorage.removeItem(SIGNUP_HANDOFF_STORAGE_KEY); } catch { /* storage is unavailable */ }
        setUnavailable(new URLSearchParams(window.location.search).get("handoff") === "1");
      }
      setMounted(true);
    } catch {
      try { localStorage.removeItem(SIGNUP_HANDOFF_STORAGE_KEY); } catch { /* storage is unavailable */ }
      setUnavailable(new URLSearchParams(window.location.search).get("handoff") === "1");
      setMounted(true);
    }
  }, []);

  if (!state.handoff || state.status === "saved") {
    return unavailable ? (
      <section className="rounded-[16px] border border-amber-500/30 bg-amber-500/[0.08] p-5 text-sm text-amber-100">
        {mounted ? <>This audit draft is unavailable or expired on this browser. <a className="font-bold underline" href="https://tryskilly.app/tools/ai-onboarding-audit/">Return to the AI onboarding audit</a> to generate a new one.</> : "Checking for your audit draft…"}
      </section>
    ) : null;
  }

  async function importDraft() {
    setState((current) => ({ ...current, status: "importing" }));
    try {
      const response = await fetch("/api/dashboard/handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state.handoff),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (response.ok) {
        try { localStorage.removeItem(SIGNUP_HANDOFF_STORAGE_KEY); } catch { /* storage is unavailable */ }
        setState({ handoff: null, status: "saved" });
        router.refresh();
        return;
      }
      setState((current) => ({
        ...current,
        status: response.status === 409 ? "conflict" : "error",
        message: body.message ?? "We could not save this draft. Review it and try again.",
      }));
    } catch {
      setState((current) => ({ ...current, status: "error", message: "Network error. Check your connection and try again." }));
    }
  }

  function discardDraft() {
    try { localStorage.removeItem(SIGNUP_HANDOFF_STORAGE_KEY); } catch { /* storage is unavailable */ }
    setState({ handoff: null, status: "saved" });
  }

  return (
    <section className="rounded-[16px] border border-amber-500/30 bg-amber-500/[0.08] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-300">Audit draft ready</p>
          <h2 className="mt-1 text-lg font-bold text-gray-100">Review your generated teaching skill.</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
            Skilly prepared a draft from your public site. Review the generated content below, then save it into the empty project. Your domain and install settings stay unchanged.
          </p>
          <p className="mt-3 text-xs text-gray-400">
            Source: <span className="font-mono text-gray-300">{new URL(state.handoff.auditUrl).host}</span>
            {state.handoff.activationGoal ? <> · Goal: <span className="text-gray-300">{state.handoff.activationGoal}</span></> : null}
          </p>
          <details className="mt-3 max-w-2xl rounded-[10px] border border-white/[0.08] bg-black/20 p-3">
            <summary className="cursor-pointer text-xs font-bold text-gray-300">Preview generated draft</summary>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-400">{state.handoff.prefillSkill}</pre>
          </details>
          {state.message && <p className="mt-3 text-sm text-amber-200">{state.message}</p>}
        </div>
        <div className="flex w-full flex-wrap justify-end gap-2 lg:w-auto">
          <ButtonLink href="/dashboard/skill" variant="secondary">Open skill editor</ButtonLink>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={discardDraft} disabled={state.status === "importing"} className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-[9px] border border-white/[0.12] px-3 text-sm font-bold text-gray-300 transition hover:bg-white/[0.06] disabled:opacity-60">Discard</button>
            <button type="button" onClick={importDraft} disabled={state.status === "importing"} className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-[9px] bg-amber-500 px-4 text-sm font-bold text-gray-950 transition hover:bg-amber-600 disabled:opacity-60">
              {state.status === "importing" ? "Saving…" : "Save reviewed draft"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
