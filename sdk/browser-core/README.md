# @skilly/browser-core

Browser-generic Skilly logic shared between `@skilly/web` (the embeddable widget) and the
Skilly browser extension: DOM digest, selector-based pointing, the click/fill action executor,
Realtime session (WebRTC to OpenAI), prompt composition, and the wasm core loader.

No UI, no tenant/auth/billing concerns — those are each consumer's own responsibility.

Consumed via a local `file:` dependency (this repo has no workspaces config):
`"@skilly/browser-core": "file:../browser-core"`. Ships TypeScript source directly; consumers'
bundlers (tsup, Vite) compile it, so there is no separate build step here.
