"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { ApiKeyInfo } from "@/db/repo";
import { createKeyAction, revokeKeyAction, type CreateKeyState } from "./actions";
import { Button, ConfirmModal, Select, StatusPill } from "./v2";

export function KeyManager({ keys }: { keys: ApiKeyInfo[] }) {
  const [createState, createKey, creating] = useActionState<CreateKeyState, FormData>(createKeyAction, {});

  return (
    <section className="rounded-[16px] border border-line bg-surface p-[18px] shadow-card">
      <div className="text-[15px] font-bold tracking-[-0.01em] text-fg">API keys</div>
      <p className="mt-1 text-xs text-fg-muted">
        Publishable keys run widgets in approved origins. Secret keys are reserved for trusted server-side integrations.
      </p>

      {keys.length > 0 ? (
        <ul className="mt-4 divide-y divide-line-soft">
          {keys.map((apiKey) => (
            <li key={apiKey.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[13px] text-fg-muted">
                <code className="break-all">{apiKey.keyType === "publishable" && apiKey.displayKey
                  ? apiKey.displayKey
                  : `${apiKey.keyType === "secret" ? "sk" : apiKey.prefix}_…${apiKey.last4}`}</code>
                {apiKey.keyType === "publishable" && apiKey.displayKey && <CopyKeyButton displayKey={apiKey.displayKey} />}
                <StatusPill tone={apiKey.keyType === "secret" ? "amber" : "neutral"} label={apiKey.keyType} />
                {apiKey.revoked && <StatusPill tone="red" label="revoked" />}
              </span>
              {!apiKey.revoked && <RevokeKeyButton apiKey={apiKey} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-fg-muted">No keys yet.</p>
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

      {createState.error && <p className="mt-3 text-sm text-danger">{createState.error}</p>}
      {createState.rawKey?.startsWith("sk_") && (
        <div className="mt-4 rounded-[12px] border border-accent-line bg-accent-soft p-3">
          <p className="text-xs font-bold text-accent-text">Copy this key now. It won&apos;t be shown again.</p>
          <code className="mt-1.5 block break-all font-mono text-[13px] text-accent-text">{createState.rawKey}</code>
        </div>
      )}
    </section>
  );
}

function CopyKeyButton({ displayKey }: { displayKey: string }) {
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(displayKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={copyKey} aria-label="Copy publishable key"
      className="inline-flex h-[30px] items-center gap-1.5 rounded-[8px] border border-line bg-surface px-2.5 font-sans text-xs font-bold text-fg transition hover:bg-surface-strong">
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : "Copy"}
    </button>
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
            Apps using <span className="font-mono text-fg">{apiKey.prefix}_…{apiKey.last4}</span> will stop working immediately. This can&apos;t be undone.
          </>
        }
        confirmLabel="Revoke key"
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}
