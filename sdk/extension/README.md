# @skilly/extension

The Skilly browser extension: point, talk, and act on any page, in any browser tab — including
cross-origin iframes the embeddable widget (`@skilly/web`) structurally cannot reach.

Built with [WXT](https://wxt.dev). Consumes `@skilly/browser-core` for all browser-generic logic
(DOM digest, pointing, actions, Realtime session, prompt composition) — see that package's
README for what's shared vs. extension-specific.

Design: `docs/superpowers/specs/2026-07-27-chrome-extension-design.md`.

- `bun run dev` — Chrome dev mode
- `bun run dev:firefox` — Firefox dev mode
- `bun run build` / `bun run build:firefox` — production builds
- `bun run typecheck` — `tsc --noEmit`

Builds are MV3 for both targets (`manifestVersion: 3` is pinned in `wxt.config.ts`; WXT would
otherwise emit MV2 for Firefox), producing `.output/chrome-mv3/` and `.output/firefox-mv3/`.

The Studio backend surface is `POST /api/extension/auth/exchange`, `GET
/api/extension/entitlement`, `GET /api/extension/openai/token`, and `POST
/api/extension/usage`. Chrome and Firefox manifests are generated separately: Chrome receives the
`offscreen` permission and pinned Chromium key, while Firefox receives its Gecko ID and required
data-collection disclosure.
