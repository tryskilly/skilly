# Security Audit + MVB Checklist for RVB Launch

Date: 2026-04-12  
Scope: `leanring-buddy/` macOS app + `worker/` Cloudflare Worker + release/open-source readiness surfaces.

## Executive Verdict

Status: **NOT READY for RVB launch**  
Reason: Critical auth and secret-exposure issues in the Worker allow unauthenticated API-key extraction and endpoint abuse.

## Findings (Ordered by Severity)

### CRITICAL

1. Unauthenticated OpenAI API key exfiltration
- Evidence in code: [`worker/src/index.ts:74`](worker/src/index.ts:74), [`worker/src/index.ts:388`](worker/src/index.ts:388), [`worker/src/index.ts:398`](worker/src/index.ts:398)
- Behavior: `GET /openai/token` returns the raw `OPENAI_API_KEY` to any caller.
- External validation: `curl` to production worker returned JSON keys `apiKey` and `model`.
- Impact: Anyone with the URL can steal and abuse your paid OpenAI key.
- OWASP mapping: A01 Broken Access Control, A02 Cryptographic Failures (secret exposure), A05 Security Misconfiguration.

2. Worker operates as unauthenticated public proxy for paid third-party APIs
- Evidence in code: [`worker/src/index.ts:48`](worker/src/index.ts:48), [`worker/src/index.ts:51`](worker/src/index.ts:51), [`worker/src/index.ts:54`](worker/src/index.ts:54), [`worker/src/index.ts:287`](worker/src/index.ts:287), [`worker/src/index.ts:346`](worker/src/index.ts:346), [`worker/src/index.ts:317`](worker/src/index.ts:317)
- Behavior: `/chat`, `/tts`, `/transcribe-token` are callable without user auth.
- Impact: API credit drain, abuse, service disruption, possible incident response burden.
- OWASP mapping: A01 Broken Access Control, A05 Security Misconfiguration.

### HIGH

3. No caller authentication on entitlement and checkout endpoints
- Evidence in code: [`worker/src/index.ts:42`](worker/src/index.ts:42), [`worker/src/index.ts:64`](worker/src/index.ts:64), [`worker/src/index.ts:437`](worker/src/index.ts:437), [`worker/src/index.ts:567`](worker/src/index.ts:567)
- External validation: unauthenticated `GET /entitlement?user_id=test-user` returns `{"status":"none"}`.
- Impact: Entitlement probing and abuse of billing-related routes; business-logic abuse risk.
- OWASP mapping: A01 Broken Access Control.

4. OAuth flow lacks `state` correlation and anti-CSRF binding
- Evidence in code: [`worker/src/index.ts:106`](worker/src/index.ts:106), [`worker/src/index.ts:108`](worker/src/index.ts:108), [`leanring-buddy/leanring_buddyApp.swift:130`](leanring-buddy/leanring_buddyApp.swift:130), [`leanring-buddy/leanring_buddyApp.swift:137`](leanring-buddy/leanring_buddyApp.swift:137)
- External validation: `/auth/url` query params include `client_id`, `redirect_uri`, `response_type`, `provider` but no `state`.
- Impact: Login CSRF / account confusion risk.
- OWASP mapping: A07 Identification and Authentication Failures.

### MEDIUM

5. Webhook signature verification lacks timestamp freshness/replay window
- Evidence in code: [`worker/src/index.ts:495`](worker/src/index.ts:495), [`worker/src/index.ts:666`](worker/src/index.ts:666), [`worker/src/index.ts:674`](worker/src/index.ts:674)
- Behavior: Signature is checked, but timestamp is not validated against max skew.
- Impact: Replay of previously valid signed webhook payloads if intercepted/logged.
- OWASP mapping: A08 Software and Data Integrity Failures.

6. Dev toolchain has known vulnerabilities (non-prod path but relevant for supply-chain hygiene)
- Evidence in lockfile: [`worker/package-lock.json:1535`](worker/package-lock.json:1535)
- Audit output: `npm audit --json` reports:
  - `undici` high (`GHSA-vrm6-8vpv-qv8q`, plus multiple moderates)
  - `esbuild` moderate (`GHSA-67mh-4wv8-2f99`)
  - transitive via `wrangler`; suggested fix is `wrangler@4.81.1`
- Impact: Primarily dev/local risk; still important for open-source users and CI runners.
- OWASP mapping: A06 Vulnerable and Outdated Components.

### LOW

7. Open-source release artifact labeling is inconsistent (`Skilly`, `Clicky`, `makesomething`)
- Evidence: [`README.md:1`](README.md:1), [`scripts/release.sh:36`](scripts/release.sh:36), [`appcast.xml:4`](appcast.xml:4)
- Impact: Trust/confusion issue; can increase phishing/spoofing risk and complicate incident handling.

8. No dedicated third-party attributions/NOTICE bundle beyond root MIT license
- Evidence: only root [`LICENSE`](LICENSE) found in repository scan.
- Impact: Open-source compliance and distribution-risk exposure, especially for packaged binaries.

## What Was Checked

- Secret-pattern scan over repo (`rg`).
- Static review of auth/session/token, worker routes, entitlement/billing, and webhook signature code.
- Dependency checks:
  - `npm audit --omit=dev --json` (prod deps clean)
  - `npm audit --json` (dev deps contain high/moderate vulns)
  - `npm outdated --json` (none for current range)
- External endpoint validation (production worker):
  - `/openai/token` response shape confirms raw key exposure.
  - `/entitlement` accessible without auth.
  - `/auth/url` contains no `state`.
- Upstream version/security context:
  - Sparkle releases page shows 2.9.1 latest while project is pinned to 2.9.0.
  - PLCrashReporter pinned at 1.12.2 (latest listed).

## MVB Checklist for RVB Launch

Legend: `[ ]` not done, `[x]` done, `[~]` partial

### A) Launch-Blocking Security Controls

- [ ] Protect every Worker route with caller authentication (JWT/session token + server-side verification).
- [ ] Remove raw key relay model; replace `/openai/token` with short-lived scoped token flow.
- [ ] Add route-level authorization checks for `/checkout/create` and `/entitlement`.
- [ ] Add anti-abuse protections (rate limits + bot/threat controls) on all public endpoints.
- [ ] Add OAuth `state` generation + verification across `/auth/url` and app callback handling.
- [ ] Add webhook replay protection (timestamp tolerance and optional nonce/id deduping).
- [ ] Rotate all currently deployed secrets after auth changes are live.

### B) Dependency and Build Security

- [ ] Upgrade `wrangler` to a patched major (`4.81.1` or newer) and regenerate lockfile.
- [~] `npm audit --omit=dev` clean for production dependency graph.
- [ ] Add CI gates: `npm audit` (prod + dev policies), secret scan, and lockfile integrity checks.

### C) Data Security and Privacy Labels

- [ ] Produce an explicit data inventory for launch:
  - screen captures (to OpenAI),
  - audio (to OpenAI),
  - user identifiers/email (to WorkOS/PostHog),
  - telemetry fields.
- [ ] Ensure privacy labels disclose identifiers and analytics usage accurately (PostHog `identify`, `user_id`, email linkage).
- [ ] Add/verify user-facing privacy policy language matches actual telemetry fields.
- [ ] Verify consent path for beta telemetry is enforced before emitting telemetry events.

### D) Open-Source and Label/Compliance Readiness

- [ ] Add `THIRD_PARTY_NOTICES.md` (or equivalent in-app notices) covering Sparkle, PostHog, PLCrashReporter, and Worker deps as required by their licenses.
- [ ] Normalize release labels/branding (`Skilly` vs `Clicky` vs `makesomething`) across README, scripts, appcast, release artifacts.
- [ ] Confirm open-source instructions do not depend on shared production Worker endpoints for security-sensitive flows.
- [ ] Add a SECURITY.md with vulnerability disclosure and contact process.

### E) Verification Before RVB Go/No-Go

- [ ] Pen-test the Worker as an unauthenticated internet client (expected: no key material ever returned).
- [ ] Validate authn/authz unit tests for all endpoints.
- [ ] Validate OAuth CSRF protections with negative tests.
- [ ] Validate webhook replay attempts fail.
- [ ] Run launch dry-run with fresh secrets and verify key rotation plan.

## Suggested Priority Order

1. Lock down Worker auth and remove raw key relay.
2. Rotate secrets.
3. Add OAuth `state` and webhook replay checks.
4. Upgrade `wrangler` and lock dev dependency posture.
5. Finalize privacy labels + open-source notices + brand labeling consistency.
