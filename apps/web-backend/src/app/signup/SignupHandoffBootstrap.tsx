"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SIGNUP_HANDOFF_STORAGE_KEY, SIGNUP_HANDOFF_TTL_MS, type SignupHandoff } from "@/lib/signupHandoff";

export function SignupHandoffBootstrap({ handoff }: { handoff: SignupHandoff | null }) {
  const [storageError, setStorageError] = useState(false);
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  useEffect(() => {
    if (!handoff) return;
    try {
      localStorage.setItem(
        SIGNUP_HANDOFF_STORAGE_KEY,
        JSON.stringify({ handoff, expiresAt: Date.now() + SIGNUP_HANDOFF_TTL_MS }),
      );
      const cleanUrl = new URL(window.location.href);
      ["audit_url", "activation_goal", "prefill_skill"].forEach((key) => cleanUrl.searchParams.delete(key));
      window.history.replaceState({}, "", cleanUrl.toString());
    } catch {
      setStorageError(true);
    }
  }, [handoff, searchParamsString]);

  return storageError ? (
    <p role="alert" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
      We couldn&apos;t save your audit draft in this browser. Return to the audit and choose &quot;Draft my onboarding guide&quot; again after enabling site storage.
    </p>
  ) : null;
}
