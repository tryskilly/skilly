# Status — `feature/web-v2-premium`

> Coordination note per `parallel-agent-guidelines.md` §1.5. If you are another
> agent working in the **Backend (Next.js)** lane (`apps/web-backend/**`), read
> this before editing those files.

- **Base branch:** `origin/develop` @ `29c4948`
- **Work branch:** `feature/web-v2-premium`
- **Worktree:** `../skilly-web-v2` (isolated)
- **Lane:** Backend (Next.js) — `apps/web-backend/**`
- **Agent:** ZCode session (started 2026-06-15)
- **State:** **ready for review** — all 6 slices complete, validated green

## Intent

Replace the current dashboard UI with the v2 premium design from the designer
handoff (`~/Downloads/skilly_web_v2_premium_handoff`), implemented in our real
stack: Next.js App Router + React + TypeScript + Tailwind v4. The prototype HTML
is a **visual reference only** — tokens/components become Tailwind utilities +
React components, not raw CSS classes.

Scope (user-approved): **Full P0, backend included**, delivered **sliced on one
branch**, and **extend the backend** to capture richer usage metrics.

## Slices (each = a commit on this branch)

1. **Foundation** — design tokens (Tailwind `@theme`), DM Sans + JetBrains Mono
   via `next/font`, global background. No visible page change yet.
2. **Component library** — v2 primitives in `dashboard/v2/`: Button, StatusPill,
   Panel, Field/Select, CodeBlock, DataTable, Metric, ReadinessPanel,
   Toggle, AppShell (sidebar + topbar). Built on tokens.
3. **App shell + overview** — wire AppShell, rebuild `/dashboard` overview
   (readiness hero, usage strip, widget health, recent sessions).
4. **Restyle existing dashboard pages** — install, widget, skill, origins, keys,
   usage, billing, settings, admin. Each ported to v2 components + copy.
5. **Auth + onboarding (new P0 routes)** — `/login` split-screen restyle,
   `/signup`, `/auth/callback` loading state, and the 4-step `/onboarding`
   flow (company → install → skill → test).
6. **Backend: richer usage capture** — extend `usage_events` (page, domain,
   duration, result) + new repo queries (recent sessions, top pages/domains,
   avg session, error rate). Migration + tests. Then wire into overview/usage.

## Validation (per slice)

- `bun test` (target: 63 → grows with new backend tests)
- `bun run typecheck` (clean)
- `bun run build` (clean)

## Blockers

None yet. Coordinating to avoid collision with any concurrent backend agent.
