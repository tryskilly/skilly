# PRD + Execution Plan: Skilly Web Actions (Click-to-Action)

> Status: **Draft for review**. Proposed as **Phase 10** on top of the Web SDK (Phase 8, shipped
> 8.0–8.6) and the multi-tenant backend. Companion to `web-sdk-prd.md` and `web-sdk-sketch.md`.
> Decision context: build-vs-buy analysis concluded **build the single-step executor in-house,
> adopt [alibaba/page-agent](https://github.com/alibaba/page-agent) (MIT) only for autonomous
> multi-step tasks, and only when a tenant asks for them** (see §12).

## 1. Summary

Today the web widget **points and talks** — the tutor identifies the element, flies the cursor
to it, and tells the user what to do. Web Actions lets the tutor **do the step**: "click the
Export button for you", "fill in the project name". Two capability tiers:

- **Tier 1 — guided single-step actions** (`[ACT]`): the Realtime voice session (the existing
  brain) emits an action tool call against an element the DOM digest already registered. The
  widget flies the cursor there, asks for confirmation when required, executes, and reports the
  outcome back to the model. **No second LLM, no agent loop, no new dependency.**
- **Tier 2 — autonomous multi-step tasks** (page-agent): "do my whole profile setup". Deferred
  and demand-gated. Integrated as a lazy-loaded optional module whose LLM calls are proxied and
  metered through our backend.

## 2. Problem

- Voice guidance still requires the end-user to find and operate the control themselves — the
  last-mile friction Skilly exists to remove. Competitors (Pendo, CommandBar/Copilot) are adding
  "do it for me".
- A naive integration of an off-the-shelf page agent would run a second LLM loop alongside our
  Realtime session (double cost, two brains disagreeing about one page) and would ship an
  unmetered, unguarded actuator into tenants' customer-facing pages.

## 3. Goals

1. The tutor can execute a single UI step the user asked about, with the user watching and in
   control (confirm affordance; cancel at any time).
2. One brain: the existing Realtime session decides *what* to act on; the widget only actuates.
3. Every action is tenant-opt-in, guarded (destructive-action confirmation, opt-out annotation),
   and metered in `usage_events`.
4. A clean seam so Tier 2 (page-agent) can be added later with **zero rework** of Tier 1.

## 4. Non-goals (v1)

1. Autonomous multi-step execution (that is Tier 2 / Phase 10.3, demand-gated).
2. Desktop (macOS) actions — OS-level clicking needs the Accessibility API and its own safety
   story; separate future PRD.
3. Acting inside cross-origin iframes (browser-blocked, same as pointing).
4. Building or vendoring our own observe→act agent loop or DOM-hardening layer — explicit
   build-vs-buy decision: that layer is a commodity (browser-use lineage); our moat is the tutor.

## 5. Users

- **End-user / visitor**: asks "how do I X?" → tutor offers "want me to do it?" → watches the
  cursor perform the step.
- **Site owner (tenant)**: enables Actions per project in Studio, fences off dangerous UI with
  an annotation, sees action usage in the dashboard.
- **Skilly platform**: meters actions; proxies + meters Tier 2 agent LLM calls.

## 6. Reuse map — start from what already exists (do NOT re-code)

| Need | Already exists | Gap |
| --- | --- | --- |
| Stable element identity | `sdk/web/src/digest.ts` — element registry with ids, labels, rects | none |
| Locate + travel to element | `sdk/web/src/pointing.ts` — resolve + bezier cursor flight, re-anchor | none |
| Model → widget directives | `sdk/web/src/realtime.ts` data channel; desktop precedent `applyPointDirectiveFromToolCall` (CompanionManager.swift) | add an `act` tool to `session.update` and a handler |
| Tenant gating + config | `tenant_widget_configs` table, `WidgetConfigForm`, widget config fetch | add `actionsEnabled` field |
| Metering | `usage_events` with `kind` column; `/api/web/usage` validation patterns | add `kind: "action"` |
| Backend auth for new routes | `authenticateWebRequest` (key + origin/app-id) | none |
| Session teardown safety | `liveSessionGeneration` guard + `closed` flag rules (see CLAUDE.md "Web SDK Session Lifecycle Protection") | new async paths MUST follow the same rules |

## 7. Tier 1 architecture (Phase 10.0–10.2)

```
Realtime session (gpt-realtime, WebRTC data channel)
  └─ tool: perform_action { action: "click"|"fill"|"select", elementId, value?, destructive? }
        └─ ActionExecutor (new, sdk/web/src/actions.ts)
             1. resolve elementId via digest registry (re-digest if stale)
             2. cursor flight to target (pointing engine, reused)
             3. gate: confirm chip if destructive OR tenant requires confirm-all
             4. execute (click / native-setter fill + input+change events / select)
             5. re-digest the local region; send tool result {ok, newStateSummary} back
                over the data channel so the tutor narrates the outcome
```

Guardrails (all v1, none deferred):

- **Opt-in**: `actionsEnabled` per widget config, default **off**. Widget never registers the
  tool when off — the model cannot even attempt an action.
- **`data-skilly-no-act`**: any element (or ancestor) carrying it is refused with a tool error.
- **Destructive gate (confirm-by-default)**: the confirm chip is required for every action
  unless the target is tenant-annotated (`data-skilly` attribute = pre-approved surface) AND
  the model did not flag `destructive` AND the executor's keyword screen of the accessible
  label (delete/remove/pay/send/submit/etc.) is clean. Model input is a trust boundary; the
  executor's own screen is the enforcement — cross-review showed label-only screening is
  bypassable (`aria-label="OK"` on a delete button), hence the inverted default.
- **User presence**: actions only execute during a live session with the widget visible; Escape
  or bubble-dismiss cancels between flight and execution.
- **Rate limit**: max N actions per turn (start: 3) to bound a misbehaving model.

## 8. Tier 2 architecture (Phase 10.3, demand-gated)

- **Trigger to build**: a paying tenant requests autonomous multi-step tasks. Do not build ahead
  of that (YAGNI — Tier 1 covers guided teaching, which is the product).
- `POST /api/web/agent` on web-backend: OpenAI-compatible chat-completions proxy. Auth =
  `authenticateWebRequest`; quota-check before forwarding; every call recorded as
  `usage_events kind: "agent_call"`. The publishable key is the bearer; the real LLM key never
  reaches the browser (same principle as token minting).
- Widget dynamic-imports `page-agent` from CDN only when the tenant enables "Autonomous tasks"
  (separate flag from `actionsEnabled`); configured with `baseURL` = our proxy. Bundle stays ~7KB
  for everyone else (same lazy-tolerant pattern as `core.ts`).
- Handoff seam: Realtime session emits `run_task { instruction }` tool call → widget pauses the
  voice turn → `PageAgent.execute(instruction)` → result returned as tool output → tutor
  narrates. `data-skilly-no-act` is enforced by pre-filtering page-agent's action targets.
- Fork hedge: pin the version; if upstream stalls, vendor the actuation primitives we use (MIT).

## 9. Phasing

- **10.0 — ActionExecutor + `perform_action` tool** (`sdk/web/src/actions.ts`, wiring in
  `realtime.ts`/`index.ts`): click + basic fill on digest-registered elements; cursor flight +
  confirm chip; `data-skilly-no-act`; destructive keyword screen; per-turn rate limit; tool
  result feedback. Validated by `bun test` (executor pure parts) + Playwright (click lands on a
  `data-skilly` element and the DOM mutates) + a live voice session.
- **10.1 — Studio + metering**: `actionsEnabled` in widget config (schema + migration +
  `WidgetConfigForm` + config fetch), `usage_events kind: "action"`, PostHog events
  (`web_action_executed`, `web_action_refused`), dashboard usage page shows action counts,
  install-page docs for `data-skilly-no-act`. E2E: widget-embed spec covers on/off gating.
- **10.2 — Input hardening**: React-controlled inputs (native value setter + synthetic
  `input`/`change`), `<select>` and common combobox patterns, checkbox/radio, scroll-into-view
  before flight, stale-element re-resolve retry. Borrow *patterns* from browser-use/page-agent,
  not code. Exit: works on the demo host page + two real tenant frameworks (React + one other).
- **10.3 — Autonomous tasks via page-agent** (demand-gated, see §8): backend proxy route +
  quota, lazy import, `run_task` seam, separate opt-in + metering kind, Studio toggle + docs.
- **10.4 (future, separate PRD) — Desktop actions**: macOS Accessibility-API actuation with the
  same tool schema, sharing the guardrail policy via `core/policy` if the Rust core is active.

## 10. Acceptance criteria (Tier 1 smoke test)

1. On the demo page with Actions enabled: ask "click the upgrade button for me" → cursor flies,
   chip confirms, click executes, tutor says it's done — and the button's handler actually ran.
2. Same request with Actions disabled in Studio → the model has no `perform_action` tool and
   answers with pointing + guidance only (no refusal artifacts).
3. An element marked `data-skilly-no-act` → tool call returns a refusal; tutor falls back to
   pointing; a `web_action_refused` event is captured.
4. A "Delete project" button → confirm chip always appears, even if the model sent
   `destructive: false`.
5. `usage_events` contains one `kind: "action"` row per executed action, visible in the usage
   dashboard.
6. Toggling the widget off mid-flight cancels the action; no execution after teardown
   (generation-guard rules hold — no action fires after `stopLiveSession`).

## 11. Risks / open decisions

1. **Model reliability of `elementId` targeting** — mitigated by digest ids being in-context and
   the executor refusing unknown ids (tool error → model retries with pointing). Monitor
   `web_action_refused` rate.
2. **Confirm-chip fatigue vs. safety** — v1 ships confirm-by-default; tenants skip the chip
   only on `data-skilly`-annotated elements (their declared safe surfaces). Revisit after
   usage data; loosening is easier than tightening after an incident.
3. **Liability framing** — actions run in the end-user's session on the tenant's site. Terms
   update needed before GA (tenant accepts responsibility for enabling Actions). Legal, not
   engineering; must land with 10.1.
4. **page-agent API drift** (Tier 2 only) — pin version; proxy isolates us from model-side
   changes; MIT fork is the floor.
5. **Fill semantics on exotic editors** (rich text, canvas apps) — out of scope; executor
   refuses non-form-control targets in 10.0, revisit in 10.2.
6. **Metering is honor-system** (flagged again by 10.1 cross-review) — `/api/web/usage` trusts
   repeatable client reports for seconds AND action counts; a script on an allowed origin can
   inflate both. Known, pre-existing trust model; the fix is cross-cutting (session-id-tied,
   idempotent reports anchored to the token mint) and is tracked as backend hardening, not an
   actions-only patch. Action counts touch no billing path; seconds already gate quota, so
   harden both together.

## 12. Build-vs-buy decision record

Single-step, user-in-the-loop actuation is **built in-house** (~150 lines over existing digest +
pointing + realtime plumbing; a second LLM loop for this would double cost and split the brain).
Autonomous multi-step actuation is **bought** (page-agent, MIT, browser-use DOM lineage) because
its value is years of DOM edge-case hardening orthogonal to Skilly's differentiation — and it is
only adopted when real tenant demand exists. We never write our own agent loop or DOM-hardening
layer in either branch.
