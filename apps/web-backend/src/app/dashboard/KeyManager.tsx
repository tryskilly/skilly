"use client";

import { useActionState, useRef } from "react";
import type { ApiKeyInfo } from "@/db/repo";
import { createKeyAction, revokeKeyAction, type CreateKeyState } from "./actions";
import { Button, ConfirmModal, Select, StatusPill } from "./v2";

/**
 * Key management (v2). Publishable + secret keys in one list with a one-time
 * reveal banner when a key is freshly created. Revoke is gated by a
 * confirmation modal (spec §11 #12). Preserves the createKeyAction/revokeKeyAction
 * contracts from v1.
 */
export function KeyManager({ keys }: { keys: ApiKeyInfo[] }) {
  const [createState, createKey, creating] = useActionState<CreateKeyState, FormData>(createKeyAction, {});

  return (
    <section className="rounded-[16px] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.058),rgba(255,255,255,0.034))] p-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="text-[15px] font-bold tracking-[-0.01em] text-gray-100">API keys</div>
      <p className="mt-1 text-xs text-muted">
        Publishable keys run widgets in approved origins. Secret keys are reserved for trusted server-side integrations.
      </p>

      {keys.length > 0 ? (
        <ul className="mt-4 divide-y divide-line-soft">
          {keys.map((apiKey) => (
            <li key={apiKey.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-2 font-mono text-[13px] text-gray-300">
                {apiKey.prefix}_…{apiKey.last4}
                <StatusPill tone={apiKey.keyType === "secret" ? "amber" : "neutral"} label={apiKey.keyType} />
                {apiKey.revoked && <StatusPill tone="red" label="revoked" />}
              </span>
              {!apiKey.revoked && <RevokeKeyButton apiKey={apiKey} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No keys yet.</p>
      )}

      <form action={createKey} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Select
          label="Key type"
          name="keyType"
          defaultValue="publishable"
          options={[
            { value: "publishable", label: "Publishable (pk_)" },
            { value: "secret", label: "Secret (sk_)" },
          ]}
        />
        <Button variant="primary" analyticsEvent="dashboard_key_create_clicked" analyticsLabel="Create key" disabled={creating}>
          {creating ? "Creating…" : "Create key"}
        </Button>
      </form>

      {createState.error && <p className="mt-3 text-sm text-[#fca5a5]">{createState.error}</p>}
      {createState.rawKey && (
        // One-time reveal banner (spec §5.13): shown once after creation.
        <div className="mt-4 rounded-[12px] border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs font-bold text-amber-300">Copy this key now — it won&apos;t be shown again.</p>
          <code className="mt-1.5 block break-all font-mono text-[13px] text-amber-100">{createState.rawKey}</code>
        </div>
      )}
    </section>
  );
}

/** Per-row revoke button that owns its form ref so the confirm modal can submit it. */
function RevokeKeyButton({ apiKey }: { apiKey: ApiKeyInfo }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={revokeKeyAction} ref={formRef} className="contents">
      <input type="hidden" name="keyId" value={apiKey.id} />
      <ConfirmModal
        trigger={
          <Button variant="danger" type="button" analyticsEvent="dashboard_key_revoke_clicked" analyticsLabel={apiKey.keyType}>
            Revoke
          </Button>
        }
        title="Revoke this key?"
        body={
          <>
            Apps using <span className="font-mono text-gray-200">{apiKey.prefix}_…{apiKey.last4}</span> will stop working immediately. This can&apos;t be undone.
          </>
        }
        confirmLabel="Revoke key"
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}
