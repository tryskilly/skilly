"use client";

import { useActionState } from "react";
import type { ApiKeyInfo } from "@/db/repo";
import { createKeyAction, revokeKeyAction, type CreateKeyState } from "./actions";
import { FormButton } from "./ui";

export function KeyManager({ keys }: { keys: ApiKeyInfo[] }) {
  const [createState, createKey, creating] = useActionState<CreateKeyState, FormData>(
    createKeyAction,
    {},
  );

  return (
    <section className="rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <h2 className="text-xl font-bold tracking-[-0.025em] text-neutral-100">API keys</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Publishable keys run widgets in approved origins. Secret keys are reserved for trusted server-side integrations.
      </p>

      {keys.length > 0 ? (
        <ul className="mt-4 divide-y divide-white/10">
          {keys.map((apiKey) => (
            <li key={apiKey.id} className="flex items-center justify-between gap-3 py-3">
              <span className="font-mono text-sm text-neutral-300">
                {apiKey.prefix}_…{apiKey.last4}
                <span className="ml-2 text-xs text-neutral-500">({apiKey.keyType})</span>
                {apiKey.revoked && <span className="ml-2 text-xs text-red-400">revoked</span>}
              </span>
              {!apiKey.revoked && (
                <form action={revokeKeyAction}>
                  <input type="hidden" name="keyId" value={apiKey.id} />
                  <FormButton
                    analyticsEvent="dashboard_key_revoke_clicked"
                    analyticsLabel={apiKey.keyType}
                    variant="danger"
                  >
                    Revoke
                  </FormButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">No keys yet.</p>
      )}

      <form action={createKey} className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          name="keyType"
          className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-amber-500/80"
        >
          <option value="publishable">Publishable (pk_)</option>
          <option value="secret">Secret (sk_)</option>
        </select>
        <FormButton analyticsEvent="dashboard_key_create_clicked" analyticsLabel="Create key" disabled={creating}>
          {creating ? "Creating..." : "Create key"}
        </FormButton>
      </form>

      {createState.error && <p className="mt-3 text-sm text-red-400">{createState.error}</p>}
      {createState.rawKey && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-300">Copy this key now — it won't be shown again:</p>
          <code className="mt-1 block break-all font-mono text-sm text-amber-100">{createState.rawKey}</code>
        </div>
      )}
    </section>
  );
}
