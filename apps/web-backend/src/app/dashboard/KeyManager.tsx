"use client";

import { useActionState } from "react";
import type { ApiKeyInfo } from "@/db/repo";
import { createKeyAction, revokeKeyAction, type CreateKeyState } from "./actions";

export function KeyManager({ keys }: { keys: ApiKeyInfo[] }) {
  const [createState, createKey, creating] = useActionState<CreateKeyState, FormData>(
    createKeyAction,
    {},
  );

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">API keys</h2>

      {keys.length > 0 ? (
        <ul className="mt-3 divide-y divide-neutral-800">
          {keys.map((apiKey) => (
            <li key={apiKey.id} className="flex items-center justify-between py-3">
              <span className="font-mono text-sm">
                {apiKey.prefix}_…{apiKey.last4}
                <span className="ml-2 text-xs text-neutral-500">({apiKey.keyType})</span>
                {apiKey.revoked && <span className="ml-2 text-xs text-red-400">revoked</span>}
              </span>
              {!apiKey.revoked && (
                <form action={revokeKeyAction}>
                  <input type="hidden" name="keyId" value={apiKey.id} />
                  <button className="text-xs text-neutral-400 hover:text-red-400" type="submit">
                    Revoke
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">No keys yet.</p>
      )}

      <form action={createKey} className="mt-4 flex items-center gap-2">
        <select
          name="keyType"
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
        >
          <option value="publishable">Publishable (pk_)</option>
          <option value="secret">Secret (sk_)</option>
        </select>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create key"}
        </button>
      </form>

      {createState.error && <p className="mt-3 text-sm text-red-400">{createState.error}</p>}
      {createState.rawKey && (
        <div className="mt-4 rounded-lg border border-amber-700/50 bg-amber-950/40 p-3">
          <p className="text-xs text-amber-300">Copy this key now — it won't be shown again:</p>
          <code className="mt-1 block break-all font-mono text-sm text-amber-100">{createState.rawKey}</code>
        </div>
      )}
    </section>
  );
}
