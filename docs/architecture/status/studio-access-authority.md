# Studio access authority contract

Status: implemented in the isolated backend branch and locally verified (2026-09-06). Production
deployment, provider configuration, and database migration remain root-judge gates.

## Scope and fixed policy

Studio/Postgres is the source of truth for hosted access for the Mac app, Windows shell, and
browser extension. WorkOS remains the identity provider and Polar remains the subscription
provider. Cloudflare is not consulted for token minting, entitlement, trial, or usage.

Existing policy values are unchanged:

* One lifetime hosted trial per WorkOS user: **900 seconds**.
* Hosted paid access: **10,800 seconds per Polar billing period**.
* `active`, or `canceled` with a future `period_end`, is paid access. `past_due` is a distinct
  non-active state and never inherits canceled-period access. `none`, `revoked`, and expired
  cancellation do not grant paid access.
* BYOK is a separate mode: it does not consume the hosted shared-key trial/cap. If the existing
  `requireBYOKSubscription` switch is enabled, the existing personal-subscription gate still
  applies; no new BYOK price or allowance is introduced.
* Existing native relay admin allowlist behavior remains unchanged: the built-in operator ID and
  optional server `SKILLY_ADMIN_WORKOS_USER_IDS` values bypass hosted trial/cap. This exemption
  never applies to the extension, and dashboard `super_admin` membership is not an access claim.

## Minimum server contract

1. Add a server-owned personal access state keyed by `workos_user_id`. It may be columns on
   `mac_entitlements` rather than a second logical account table: `trial_seconds_used`
   (monotonic integer, default 0), `trial_migration_state` (`unknown`/`recorded`, default
   `unknown`), and `trial_migrated_at`. A row is created transactionally on the first
   authenticated desktop **or extension** request, even when no subscription exists. Extension
   creation must not change an `unknown` migration state. The existing entitlement fields remain
   the billing record; its status union must include `past_due`.
2. Add a minimal `mac_access_sessions` table keyed by a server-issued `session_id`, binding
   user, route source, access mode (`trial`/`paid`), and the billing period snapshot at token
   issuance. This is a correlation/bucket record only; it does not reserve capacity or revoke
   OpenAI credentials.
3. Extend `mac_usage_events` with `event_id` (nullable for legacy rows, unique per user when
   present), `session_id` (nullable for legacy rows), and the server-assigned access mode and
   period snapshot. Retries with the same `(user_id, event_id)` are ignored with
   `ON CONFLICT DO NOTHING`; a different event id is never deduplicated by timestamp or amount.
   This makes network retries harmless without deleting historical rows.
4. Every hosted token route (`/api/mac/openai/token` and `/api/extension/openai/token`) runs a
   server preflight before contacting OpenAI. The preflight reads the user row and current
   Polar status under a per-user transaction/advisory lock, computes usage from Studio rows, and
   returns:

   * `200` with the ephemeral token and `remainingSeconds` when allowed;
   * `403 { code: "trial_exhausted" }` when non-paying lifetime trial is at/above 900;
   * `429 { code: "cap_reached" }` when paid-period hosted usage is at/above 10,800;
   * `403 { code: "subscription_inactive" }` for the extension when no active subscription
     exists, and for a BYOK-fee-required account without an active/canceled-with-access
     subscription.

   Authentication failures stay `401`; storage/configuration failures stay `5xx` and must never
   be interpreted as an empty entitlement or a fresh trial.
4. The preflight is a start gate, not a promise that OpenAI will stop at the boundary. The
   response includes the remaining seconds so honest clients can close a session at the limit.
   OpenAI's ephemeral credential expiry is only a credential lifetime; it cannot terminate an
   already-established direct WebRTC/WebSocket session. A hard cap would require proxying the
   Realtime stream (out of scope and a materially different architecture).
5. Usage reports are accepted only for an authenticated user and are clamped to non-negative
   integers. The server assigns the access bucket from the current entitlement/period; clients
   cannot choose `source` or whether a row is trial/paid. Reports are idempotent by `event_id`.
   Hosted rows (`relay`/`extension`) count toward the paid period when their event time lies in
   the entitlement period. BYOK rows are stored for telemetry but excluded from the hosted cap.
   Legacy rows without an event id are retained and counted conservatively; they are never
   silently erased or subtracted.

## Exact DTOs and historical-account rule

The desktop token request remains a `GET` and carries these headers:

* `Authorization: Bearer <Studio session>` (existing contract).
* `X-Skilly-Client-Migration: v1` and `X-Skilly-Legacy-Trial-Seconds: <integer 0..900>` on
  the first new Mac/Windows request for an account. New accounts send `0`; the value is a
  preservation floor, not proof of usage.

`GET /api/mac/openai/token` returns the existing fields plus:

```json
{"clientSecret":"…","expiresAt":123,"model":"gpt-realtime",
 "accessMode":"trial|paid|admin","remainingSeconds":899,
 "sessionId":"uuid","periodStart":"iso-or-null","periodEnd":"iso-or-null"}
```

`sessionId` is server-generated for correlation only; it is not a reservation. Block responses are
JSON with a stable `code`: `409 {"code":"client_migration_required"}` (non-paying desktop
request without the v1 marker), `403 {"code":"trial_exhausted"}`, `403
{"code":"subscription_inactive"}`, or `429 {"code":"cap_reached"}`. Authentication remains
`401`; missing configuration/database failures remain `5xx` and never become a fresh trial. An
active paid row without a valid canonical `period_start` is unavailable for hosted starts and
returns a `5xx`; the server must not substitute the calendar month or invent a new allowance.

The extension token route keeps its existing paid-only behavior and does **not** send `0` or mark
desktop trial migration. It may omit migration headers indefinitely; an active subscriber is
allowed, while a non-subscriber receives `subscription_inactive`. This preserves old extension
clients and prevents an extension-first login from finalizing a trial baseline for an old desktop
user.

Usage requests stay `POST /api/mac/usage` and `POST /api/extension/usage` with the existing bearer
session. New clients preserve the existing flat telemetry fields and add only these identifiers
(legacy clients may omit both during the transition):

```json
{"eventId":"uuid","sessionId":"uuid","seconds":42,"result":"completed",
 "model":"gpt-realtime","audioInputTokens":1,"audioOutputTokens":2,
 "textInputTokens":3,"textOutputTokens":4,"cachedInputTokens":0,
 "totalTokens":10,"estimatedCostUsd":"0.00010000"}
```

`eventId` is required for idempotent new-client accounting; `sessionId` is required when present
in the token response. The server looks up `sessionId` and rejects unknown or another user's
session; it assigns `source`, trial/paid mode, and billing period from that issuance record and
ignores any client-supplied hosted mode/source. The existing flat token counters and cost fields
remain flat; extension action counts may be carried for telemetry without changing allowance math.
The server returns `{ "ok": true, "recordedSeconds": 42, "duplicate": false }`.
Seconds remain non-negative and retain the existing per-event clamp. Malformed new reports are
`400`; duplicate event ids are successful no-ops. Legacy reports are retained without an id and
counted conservatively.

On the first **desktop** request carrying the v1 marker, Studio locks the user row, stores
`max(server_value, legacyTrialSecondsUsed, conservative_pre_cutover_usage_floor)` once, and marks
`trial_migration_state=recorded`. A later lower value can never reset it. Extension requests never
perform this transition. Existing pre-cutover usage rows are preserved; non-BYOK rows with no
bucket are treated conservatively toward the 900-second floor, so stale data cannot silently grant
another trial. Keep the Worker available for old desktop builds until the new clients are released
and verified; do not replay stale Polar/KV events that could resurrect canceled access.

Because client counters and future usage reports are not cryptographic evidence, this is a
one-time preservation floor, not proof of usage. The server remains monotonic thereafter; an
attacker can still under-report future seconds, which is the known limit without a Realtime proxy.

## Client responsibilities

* Mac and Windows keep local checks for responsive UX, but a successful token response is required
  before a turn. On `trial_exhausted`/`cap_reached`, show the existing paywall; never reset local
  counters on sign-out or period refresh. Send the v1 migration headers once, report one idempotent
  usage event per completed turn or closed session, and retry transient failures.
* Windows must submit usage to Studio; its current local-only counter is display/cache state, not
  authority. It must use the same WorkOS session and `/api/mac/*` contract as Mac.
* The extension should stop treating an entitlement GET as sufficient authorization. Call its
  paid-only token route and handle the server's explicit block codes; submit an idempotent usage
  event when the host closes. One WorkOS identity therefore shares the paid-period counter across
  Mac, Windows, and extension without allowing extension-first trial migration.
* Relay admins receive `accessMode=admin` with `remainingSeconds=null`; their usage is stored for
  telemetry but excluded from trial/paid aggregates. The ID is selected by the server, never a
  client claim.
* BYOK continues to call OpenAI with the user's own key and reports telemetry only (the explicit
  legacy Mac `source=byok` report has no issued session); it does not use hosted-token access
  enforcement or consume the hosted allowance.

## Concurrency and non-goals

The row lock makes first-row creation, migration-floor updates, and period reads atomic. The
issued-session row binds reports to the server's decision; the unique event id makes retries and
duplicate stop callbacks harmless. Neither mechanism reserves capacity: two concurrent token
requests can both pass before either report arrives, and the server cannot revoke a token already
handed to OpenAI. That limitation must remain visible in the release sign-off. No new pricing,
free tier, trial reset, account merge, webhook replay, or production data rewrite is part of this
contract.

## Compatibility rollout

1. Ship backend schema/parser changes and accept old usage payloads. Keep old personal Worker
   routes and existing extension behavior available.
2. Release Mac and Windows clients that send the v1 migration headers and event/session ids; the
   backend rejects only non-paying desktop requests that omit the marker. Active paid old desktop
   clients continue to work during the window. Extension clients are never rejected for a missing
   desktop marker.
3. Verify a new-account trial, a migrated exhausted account, active/canceled-with-access, past_due,
   cap, duplicate report, and concurrent starts using a test identity. Then update the extension to
   handle explicit token block codes and ship its idempotent reports.
4. Only after released clients and production usage parity are verified may Worker personal routes
   be retired. Cloudflare CDN/static assets remain untouched.

Local evidence: `scripts/personal-access-pg-integration.ts` applied migrations 0000–0010 to a
disposable PostgreSQL 17 Unix-socket cluster and passed trial-floor, duplicate/concurrent event,
issued-period bucketing, invalid-session, missing-period, and out-of-order-provider scenarios.
