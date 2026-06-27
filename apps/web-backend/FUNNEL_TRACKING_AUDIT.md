# Funnel tracking audit — marketing → Studio signup (2026-06-26)

Goal: see the full funnel as ONE user — `x_reply` visit on `tryskilly.app` → `web_builders_studio_clicked` → **account created on `studio.tryskilly.app`** → activation. Today it dead-ends at the Studio click (`$identify`, `account_created`, `signup` all = 0 in PostHog).

## What's already right ✅
- Studio (`apps/web-backend`) HAS PostHog wiring: `AnalyticsProvider.tsx` fires `dashboard_page_viewed`, `dashboard_action_clicked`, and a `$identify` when `workosUserId` is present.
- The intent to stitch identity exists (the `$identify` with `$anon_distinct_id`).
- The signup moment is known server-side: `workosAuth.ts` distinguishes `intent: "signup" | "signin"` (signup creates tenant + super_admin membership).

## What's broken ❌

### 1. Identity stitch connects the WRONG anonymous id (the main bug)
`AnalyticsProvider` builds its anon id from its **own** `localStorage["skilly_web_distinct_id"]` and posts via a manual `fetch('/capture/')`. But:
- The marketing site (`skilly-web/Layout.astro`) uses the **PostHog JS SDK**, whose distinct_id lives under a different key (`ph_<key>_posthog`).
- **`localStorage` is per-origin** — it does NOT carry from `tryskilly.app` to `studio.tryskilly.app`.

→ So Studio generates a *fresh* anon id on its own subdomain and `$identify`s the WorkOS user to **that**, never to the original `x_reply` marketing visitor. The marketing→signup hop won't join as one person.

### 2. No discrete `account_created` event
Nothing fires at the signup moment (`workosAuth.ts` where `intent === "signup"`). "Account created" can only be inferred — there's no clean conversion step in the funnel.

### 3. Same-project not verified
Marketing key and `NEXT_PUBLIC_POSTHOG_KEY` are both env-injected (host defaults to `us.i.posthog.com`). **Must confirm the prod env value equals the marketing site's key (project 376182).** If `NEXT_PUBLIC_POSTHOG_KEY` is unset/different in Studio prod, Studio sends to nothing/another project — which alone would explain the 0s.

## Best practice — the fix

**Preferred:** use the **PostHog JS SDK** in Studio, initialized identically to the marketing site:
- Same project key + `api_host`.
- `cross_subdomain_cookie: true` (default) → the anon distinct_id cookie is written on `.tryskilly.app` and carries across subdomains automatically.
- On signup: `posthog.identify(workosUserId, { email })` — SDK stitches the cross-subdomain anon id → user with no manual `$anon_distinct_id` juggling.
- Fire `posthog.capture('account_created', { plan, tenant_id })` in the signup path.

**If keeping the manual/server approach:** the marketing site must write its PostHog distinct_id into a cookie scoped to `.tryskilly.app`; Studio reads THAT cookie (not its own localStorage) as `$anon_distinct_id`. (More fragile than just using the SDK.)

## IMPLEMENTED 2026-06-26 (the critical identity fix)
- ✅ **Marketing** (`skilly-web/Layout.astro`): added explicit `cross_subdomain_cookie: true` → distinct_id cookie written on `.tryskilly.app`.
- ✅ **Studio** (`AnalyticsProvider.tsx`): `getAnonymousDistinctId()` now reads the shared PostHog cookie (`ph_<key>_posthog`) first, so Studio's anon id == the marketing visitor's. The existing `$identify` then stitches that real visitor → `workosUserId`. **The marketing → signup funnel now connects.**
- Interim signup signal: `dashboard_page_viewed` (client, correct identity) already marks "user is in" — usable for the funnel today.

## STILL TODO (needs auth-code touch — not done, flagged for safety)
1. **`account_created` conversion event.** Fire in the signup callback (`workosAuth.ts`, `intent === "signup"`) — BUT must pass `distinctId = workosUserId` explicitly, because `captureServerEvent` defaults distinct_id to `tenant_id`.
2. **Server-event identity mismatch (broader).** All `captureServerEvent` calls use `tenant_id` as distinct_id, so server events don't join the client-identified `workosUserId` profile. Align server events to the user id (or alias tenant↔user in PostHog) for full server+client funnel continuity.

## Verify-now checklist
1. Prod env: `NEXT_PUBLIC_POSTHOG_KEY` (Studio) == marketing key (project 376182)? If empty → critical, fix first.
2. Marketing site cookie domain: confirm PostHog cookie is on `.tryskilly.app` (cross_subdomain).
3. After fix: complete a real test signup, then confirm in PostHog one person profile shows `$pageview (tryskilly.app)` → `web_builders_studio_clicked` → `account_created` → `dashboard_page_viewed`.
