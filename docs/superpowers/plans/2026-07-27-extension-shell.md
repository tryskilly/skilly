# Extension Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Skilly browser extension (`sdk/extension`) for Chrome and Firefox via WXT:
background service worker as coordinator, a `chrome.offscreen` document hosting the Realtime
voice session, content scripts (including cross-origin iframes) for the page digest/pointing/
actions, and a popup for login and skill selection.

**Architecture:** Verified against WXT's current docs (fetched during planning, not assumed from
memory): WXT has no dedicated "offscreen" entrypoint — it is built as an **Unlisted Page**
(`entrypoints/offscreen.html`), and the background service worker creates it at runtime via
`chrome.offscreen.createDocument()`. `entrypoints/background.ts` (via `defineBackground`) and
`entrypoints/content.ts` (via `defineContentScript({ allFrames: true, ... })`) are WXT's native,
documented entrypoint types. This plan depends on Plan 1 (`sdk/browser-core` must exist) and Plan
2 (`/api/extension/*` routes must exist and have passed their end-to-end auth spike) — do not
start this plan until both are merged.

**Tech Stack:** WXT (Vite-based, framework-agnostic — matches `sdk/browser-core`'s vanilla-TS
style), TypeScript, Bun, `@skilly/browser-core` (Plan 1), Playwright (via WXT's test tooling) for
browser-only integration paths.

## Global Constraints

- Chrome and Firefox are the v1 targets, built from one WXT codebase (`wxt build` /
  `wxt build -b firefox`). Safari is explicitly **not** part of this plan's task list — per the
  approved design's risk note, it needs Xcode's `safari-web-extension-converter` and App Store
  review, not a WXT browser flag, and lands as a follow-on project once Chrome/Firefox ship.
- No UI framework (React/Vue/etc.) — matches `@skilly/browser-core`/`@skilly/web`'s existing
  vanilla-TS-and-Shadow-DOM style. WXT's vanilla template is the base, not React/Vue templates.
- Manifest V3 only (no MV2 fallback path).
- A session is tied to the tab it started in; navigating that tab to a new URL ends the session
  (per the approved design's data-flow section — this is a fixed decision, not open for
  reinterpretation during implementation).
- Confirm-by-default is loosened for this surface (approved design decision 6): the
  `ActionExecutor` from `@skilly/browser-core` already implements this — do not add a second
  confirm layer in the extension.
- Every cross-component message has a `type` field and is defined in the shared message-type
  file (Task 2) — no ad hoc, undocumented message shapes.

---

### Task 1: Scaffold the WXT project

**Files:**
- Create: `sdk/extension/package.json`
- Create: `sdk/extension/wxt.config.ts`
- Create: `sdk/extension/tsconfig.json`
- Create: `sdk/extension/entrypoints/background.ts` (placeholder, replaced in Task 4)
- Create: `sdk/extension/README.md`

**Interfaces:**
- Produces: a WXT project that builds for both Chrome and Firefox, with `@skilly/browser-core`
  installed as a local dependency (same `file:` pattern as Plan 1's `sdk/web`).

- [ ] **Step 1: Scaffold via WXT's vanilla TypeScript template**

```bash
cd sdk
bunx wxt@latest init extension
```

When prompted, choose the **Vanilla** (TypeScript) template — no UI framework, matching
`@skilly/browser-core`'s style. This generates `sdk/extension/` with a default `package.json`,
`wxt.config.ts`, `tsconfig.json`, and `entrypoints/background.ts`.

- [ ] **Step 2: Replace the generated `package.json` scripts and metadata**

```json
{
  "name": "@skilly/extension",
  "version": "0.1.0",
  "private": true,
  "description": "Skilly browser extension — point, talk, and act on any page.",
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip",
    "zip:firefox": "wxt zip -b firefox",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "postinstall": "wxt prepare"
  },
  "dependencies": {
    "@skilly/browser-core": "file:../browser-core"
  },
  "devDependencies": {
    "bun-types": "^1.2.0",
    "typescript": "^5.6.0",
    "wxt": "^0.20.0"
  }
}
```

(Keep whatever exact `wxt` version `wxt@latest init` actually installed in Step 1 — the version
above is illustrative; do not downgrade what the scaffolder chose.)

- [ ] **Step 3: Configure the manifest in `wxt.config.ts`**

```typescript
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  manifest: {
    name: "Skilly",
    description: "Skilly points, talks, and acts on any page you're browsing.",
    permissions: ["storage", "offscreen", "identity", "scripting"],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "Skilly",
    },
  },
});
```

`<all_urls>` is the broad permission the design's Chrome Web Store risk note flags — it is
required for the extension's core value (pointing into any page, including cross-origin
iframes) and cannot be narrowed without breaking that.

- [ ] **Step 4: Copy `sdk/web/tsconfig.json`'s compiler options, adapted for WXT**

WXT generates its own `tsconfig.json` that extends `.wxt/tsconfig.json` (created by
`wxt prepare`) — do not replace it wholesale. Instead, merge in the same strictness flags used
elsewhere in this repo. Open the generated `sdk/extension/tsconfig.json` and ensure it reads:

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 5: Install dependencies and verify the scaffold builds for both browsers**

```bash
cd sdk/extension && bun install && bun run build && bun run build:firefox
```

Expected: `bun install` resolves `@skilly/browser-core` via the local `file:` path (same
mechanism as Plan 1); both build commands succeed, producing `.output/chrome-mv3/manifest.json`
and `.output/firefox-mv2-or-mv3/manifest.json` (WXT names Firefox's output directory based on the
manifest version it targets — check the actual generated path after the build and use that exact
path in any later step that references it).

- [ ] **Step 6: Create the package README**

```markdown
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
```

- [ ] **Step 7: Commit**

```bash
git add sdk/extension/
git commit -m "Scaffold sdk/extension via WXT (vanilla TS, Chrome + Firefox)"
```

---

### Task 2: Frame registry and cross-frame digest merging (the one genuinely new piece)

**Why this task is first, before any `chrome.*` API code:** this is pure, DOM-free coordination
logic — no `sdk/web` precedent, and the part most likely to have a subtle bug (per the approved
design: multi-frame element-id collisions are real, since two different iframes can each
independently assign `el_1` to their first element). Building and testing this in isolation,
before it's wired to real browser APIs, means bugs here are caught by a fast unit test, not by
manually reproducing a multi-iframe page in a real browser.

**Files:**
- Create: `sdk/extension/src/frameRegistry.ts`
- Test: `sdk/extension/tests/frameRegistry.test.ts`

**Interfaces:**
- Consumes: `type DomDigest`, `type DigestElement` from `@skilly/browser-core`.
- Produces:
  `export interface QualifiedTarget { frameId: number; localTarget: string; }`
  `export function qualifyElementId(frameId: number, localId: string): string`
  `export function parseQualifiedTarget(qualifiedId: string): QualifiedTarget | null`
  `export class FrameRegistry { registerFrame(frameId: number, digest: DomDigest): void; unregisterFrame(frameId: number): void; clear(): void; mergedDigest(): DomDigest; }`

- [ ] **Step 1: Write the failing tests**

Create `sdk/extension/tests/frameRegistry.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { qualifyElementId, parseQualifiedTarget, FrameRegistry } from "../src/frameRegistry";
import type { DomDigest } from "@skilly/browser-core";

function digestWith(elements: Array<{ id: string; label: string }>): DomDigest {
  return {
    url: "https://example.com",
    title: "Example",
    viewport: { width: 1200, height: 800 },
    truncated: false,
    elements: elements.map((element) => ({
      id: element.id,
      role: "button",
      label: element.label,
      rect: { x: 0, y: 0, width: 10, height: 10 },
    })),
  };
}

describe("qualifyElementId / parseQualifiedTarget", () => {
  test("round-trips a frame id and local id", () => {
    const qualified = qualifyElementId(2, "el_1");
    expect(qualified).toBe("f2:el_1");
    expect(parseQualifiedTarget(qualified)).toEqual({ frameId: 2, localTarget: "el_1" });
  });

  test("returns null for a target with no frame qualifier", () => {
    expect(parseQualifiedTarget("el_1")).toBeNull();
  });

  test("returns null for a malformed frame qualifier", () => {
    expect(parseQualifiedTarget("fX:el_1")).toBeNull();
  });
});

describe("FrameRegistry", () => {
  test("merges digests from multiple frames with qualified, collision-free ids", () => {
    const registry = new FrameRegistry();
    registry.registerFrame(0, digestWith([{ id: "el_1", label: "Top frame button" }]));
    registry.registerFrame(7, digestWith([{ id: "el_1", label: "Iframe button" }])); // same local id, different frame

    const merged = registry.mergedDigest();
    const ids = merged.elements.map((element) => element.id);
    expect(ids).toEqual(["f0:el_1", "f7:el_1"]);
    expect(merged.elements.find((element) => element.id === "f7:el_1")?.label).toBe("Iframe button");
  });

  test("unregistering a frame removes its elements from the merge", () => {
    const registry = new FrameRegistry();
    registry.registerFrame(0, digestWith([{ id: "el_1", label: "A" }]));
    registry.registerFrame(1, digestWith([{ id: "el_1", label: "B" }]));
    registry.unregisterFrame(1);
    expect(registry.mergedDigest().elements.map((element) => element.id)).toEqual(["f0:el_1"]);
  });

  test("clear() empties the registry", () => {
    const registry = new FrameRegistry();
    registry.registerFrame(0, digestWith([{ id: "el_1", label: "A" }]));
    registry.clear();
    expect(registry.mergedDigest().elements).toEqual([]);
  });

  test("mergedDigest reports truncated:true if ANY registered frame was truncated", () => {
    const registry = new FrameRegistry();
    const truncatedDigest = { ...digestWith([{ id: "el_1", label: "A" }]), truncated: true };
    registry.registerFrame(0, digestWith([{ id: "el_1", label: "A" }]));
    registry.registerFrame(1, truncatedDigest);
    expect(registry.mergedDigest().truncated).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd sdk/extension && bun test tests/frameRegistry.test.ts`
Expected: FAIL — `Cannot find module '../src/frameRegistry'`.

- [ ] **Step 3: Implement `frameRegistry.ts`**

```typescript
// Multi-frame coordination — the one piece of logic with no @skilly/web precedent. Two
// different iframes can each independently assign "el_1" to their own first element, so the
// model-facing merged view must qualify every id by frame, and every POINT/action directive
// must be un-qualified back to (frameId, localTarget) before it's routed to the right frame's
// content script. This file has zero chrome.* dependencies — it is pure and DOM-free, so it is
// fully unit-testable without a browser.
import type { DomDigest, DigestElement } from "@skilly/browser-core";

export interface QualifiedTarget {
  frameId: number;
  localTarget: string;
}

const QUALIFIED_TARGET_PATTERN = /^f(\d+):(.+)$/;

export function qualifyElementId(frameId: number, localId: string): string {
  return `f${frameId}:${localId}`;
}

export function parseQualifiedTarget(qualifiedId: string): QualifiedTarget | null {
  const match = QUALIFIED_TARGET_PATTERN.exec(qualifiedId);
  if (!match) {
    return null;
  }
  return { frameId: Number(match[1]), localTarget: match[2] };
}

export class FrameRegistry {
  private frames = new Map<number, DomDigest>();

  registerFrame(frameId: number, digest: DomDigest): void {
    this.frames.set(frameId, digest);
  }

  unregisterFrame(frameId: number): void {
    this.frames.delete(frameId);
  }

  clear(): void {
    this.frames.clear();
  }

  /** Merge every registered frame's digest into one model-facing view with frame-qualified ids. */
  mergedDigest(): DomDigest {
    const elements: DigestElement[] = [];
    let truncated = false;
    let url = "";
    let title = "";
    for (const [frameId, digest] of this.frames) {
      if (frameId === 0) {
        url = digest.url;
        title = digest.title;
      }
      truncated = truncated || digest.truncated;
      for (const element of digest.elements) {
        elements.push({ ...element, id: qualifyElementId(frameId, element.id) });
      }
    }
    return {
      url,
      title,
      viewport: this.frames.get(0)?.viewport ?? { width: 0, height: 0 },
      elements,
      truncated,
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd sdk/extension && bun test tests/frameRegistry.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add sdk/extension/src/frameRegistry.ts sdk/extension/tests/frameRegistry.test.ts
git commit -m "Add FrameRegistry: multi-frame digest merging with qualified element ids"
```

---

### Task 3: Bundled skill matching (pure logic)

**Files:**
- Create: `sdk/extension/src/skillMatcher.ts`
- Create: `sdk/extension/src/bundledSkills.ts`
- Test: `sdk/extension/tests/skillMatcher.test.ts`

**Interfaces:**
- Produces:
  `export interface BundledSkill { id: string; name: string; urlPatterns: string[]; content: string; }`
  `export const BUNDLED_SKILLS: BundledSkill[]`
  `export function matchSkillForUrl(url: string, skills: BundledSkill[]): BundledSkill | null`

- [ ] **Step 1: Write the failing tests**

Create `sdk/extension/tests/skillMatcher.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { matchSkillForUrl } from "../src/skillMatcher";
import type { BundledSkill } from "../src/skillMatcher";

const testSkills: BundledSkill[] = [
  { id: "figma-basics", name: "Figma Basics", urlPatterns: ["figma.com"], content: "# Figma" },
  { id: "generic", name: "Generic", urlPatterns: [], content: "" },
];

describe("matchSkillForUrl", () => {
  test("matches a skill whose urlPattern is a substring of the hostname", () => {
    const match = matchSkillForUrl("https://www.figma.com/file/abc123", testSkills);
    expect(match?.id).toBe("figma-basics");
  });

  test("returns null when no skill's pattern matches the hostname", () => {
    expect(matchSkillForUrl("https://example.com/page", testSkills)).toBeNull();
  });

  test("does not match a pattern found only in the path or query string, not the hostname", () => {
    // "figma.com" appearing in a query param on an unrelated host must not false-match.
    const match = matchSkillForUrl("https://example.com/redirect?to=figma.com", testSkills);
    expect(match).toBeNull();
  });

  test("returns null for an unparseable URL rather than throwing", () => {
    expect(matchSkillForUrl("not a url", testSkills)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd sdk/extension && bun test tests/skillMatcher.test.ts`
Expected: FAIL — `Cannot find module '../src/skillMatcher'`.

- [ ] **Step 3: Implement `skillMatcher.ts`**

```typescript
// Matches the active tab's hostname against a bundled skill's URL patterns. Hostname-only
// matching (not path/query) — a pattern must appear in the hostname itself, so a URL that merely
// mentions a competitor's domain in a query string can't false-trigger that skill.
export interface BundledSkill {
  id: string;
  name: string;
  urlPatterns: string[];
  content: string;
}

export function matchSkillForUrl(url: string, skills: BundledSkill[]): BundledSkill | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return skills.find((skill) => skill.urlPatterns.some((pattern) => hostname.includes(pattern.toLowerCase()))) ?? null;
}
```

- [ ] **Step 4: Create `bundledSkills.ts` from the existing bundled skill library**

The `content` field for each entry is the exact text of the corresponding `SKILL.md` from the
repo's existing `skills/` directory (`skills/figma-basics/SKILL.md`,
`skills/blender-fundamentals/SKILL.md`, etc. — six skills total per `CLAUDE.md`'s Skill Files
table). Read each file and inline it:

```typescript
import type { BundledSkill } from "./skillMatcher";

export const BUNDLED_SKILLS: BundledSkill[] = [
  {
    id: "figma-basics",
    name: "Figma Basics",
    urlPatterns: ["figma.com"],
    content: `<paste the full contents of skills/figma-basics/SKILL.md here>`,
  },
  // Blender, After Effects, Premiere Pro, DaVinci Resolve, and Houdini are desktop-only
  // applications with no corresponding website to URL-match against — they are NOT included
  // here. Only skills for products with a real web app get a bundled entry in the extension.
];
```

Only `figma-basics` has a corresponding web app today (`figma.com`) — the other five bundled
skills (Blender, After Effects, Premiere Pro, DaVinci Resolve, Houdini) are desktop applications
with no URL to match against, so they are correctly excluded from `BUNDLED_SKILLS`, not a gap to
fix. The generic fallback (Task 5) covers every other site.

- [ ] **Step 5: Run the test to verify it passes, and typecheck**

Run: `cd sdk/extension && bun test tests/skillMatcher.test.ts && bun run typecheck`
Expected: PASS, all 4 tests; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add sdk/extension/src/skillMatcher.ts sdk/extension/src/bundledSkills.ts sdk/extension/tests/skillMatcher.test.ts
git commit -m "Add bundled-skill URL matching"
```

---

### Task 4: Shared message protocol

**Files:**
- Create: `sdk/extension/src/messages.ts`

**Interfaces:** Produces every message type used by Tasks 5–7 — defined once, here, so no
component invents an undocumented message shape (per Global Constraints).

- [ ] **Step 1: Define the message protocol**

No test for this file — it is pure type declarations, nothing to unit-test. Its correctness is
proven by every later task's code compiling against it.

```typescript
// The full cross-component message protocol. Every message that crosses a chrome.runtime or
// chrome.tabs boundary in this extension is declared here — content script <-> background,
// background <-> offscreen document. Nothing communicates via an ad hoc, undeclared shape.
import type { ActionRequest, ActionResult } from "@skilly/browser-core";
import type { DomDigest } from "@skilly/browser-core";

// Content script -> background
export interface RegisterFrameMessage {
  type: "register-frame";
  frameId: number;
  digest: DomDigest;
}
export interface ActionResultMessage {
  type: "action-result";
  frameId: number;
  callId: string;
  result: ActionResult;
}
export type ContentToBackgroundMessage = RegisterFrameMessage | ActionResultMessage;

// Background -> content script (chrome.tabs.sendMessage, targeted at one frameId)
export interface PointAtMessage {
  type: "point-at";
  target: string;
  label: string;
}
export interface ExecuteActionMessage {
  type: "execute-action";
  callId: string;
  request: ActionRequest;
}
export interface RefreshDigestMessage {
  type: "refresh-digest";
}
export interface ShowBannerMessage {
  type: "show-banner";
  text: string;
}
export type BackgroundToContentMessage = PointAtMessage | ExecuteActionMessage | RefreshDigestMessage | ShowBannerMessage;

// Offscreen document -> background
export interface PointRequestMessage {
  type: "point-request";
  target: string;
  label: string;
}
export interface ActionRequestMessage {
  type: "action-request";
  callId: string;
  request: ActionRequest;
}
export interface SessionStateMessage {
  type: "session-state";
  state: "connecting" | "live" | "closed" | "error";
}
export interface AssistantTextMessage {
  type: "assistant-text";
  text: string;
}
export interface UsageReportMessage {
  type: "usage-report";
  seconds: number;
  actionsExecuted: number;
  actionsRefused: number;
}
export type OffscreenToBackgroundMessage =
  | PointRequestMessage
  | ActionRequestMessage
  | SessionStateMessage
  | AssistantTextMessage
  | UsageReportMessage;

// Background -> offscreen document
export interface StartSessionMessage {
  type: "start-session";
  clientSecret: string;
  model: string;
  instructions: string;
  actionsEnabled: boolean;
}
export interface StopSessionMessage {
  type: "stop-session";
}
export interface ActionOutcomeMessage {
  type: "action-outcome";
  callId: string;
  result: ActionResult;
}
export type BackgroundToOffscreenMessage = StartSessionMessage | StopSessionMessage | ActionOutcomeMessage;

// Popup -> background. A WXT popup entrypoint sets the manifest's action.default_popup, which
// means chrome.action.onClicked NEVER fires once a popup exists (the popup opens instead) — the
// popup's own "Start/Stop on this page" button is therefore the only way to toggle a session,
// and it does so via this message, not via the toolbar-click event.
export interface ToggleSessionMessage {
  type: "toggle-session";
}
export interface GetSessionStatusMessage {
  type: "get-session-status";
}
export type PopupToBackgroundMessage = ToggleSessionMessage | GetSessionStatusMessage;
```

- [ ] **Step 2: Typecheck**

Run: `cd sdk/extension && bun run typecheck`
Expected: clean (this file only declares types; nothing consumes them yet).

- [ ] **Step 3: Commit**

```bash
git add sdk/extension/src/messages.ts
git commit -m "Define the extension's cross-component message protocol"
```

---

### Task 5: Content script — per-frame digest, minimal cursor widget, action execution

**Files:**
- Create: `sdk/extension/src/minimalCursorWidget.ts`
- Create: `sdk/extension/entrypoints/content.ts`
- Test: `sdk/extension/tests/minimalCursorWidget.test.ts`

**Interfaces:**
- Consumes: `type CursorHost` from `@skilly/browser-core` (defined in Plan 1, Task 2), `PointingEngine`, `ActionExecutor`, `buildDomDigest` from `@skilly/browser-core`; every message type from Task 4.
- Produces: `export class MinimalCursorWidget implements CursorHost` — the second `CursorHost`
  implementation the approved design's per-frame UI fix calls for (the first is `SkillyWidget` in
  `sdk/web`, which stays there — this is deliberately not shared, since it has zero chrome
  (launcher/bubble), unlike `SkillyWidget`).

- [ ] **Step 1: Write the failing test for the minimal widget**

Create `sdk/extension/tests/minimalCursorWidget.test.ts`. This test needs a DOM — Bun's test
runner does not provide one by default, so it uses `happy-dom` (add it as a devDependency in this
step, since this is the first test in the extension package needing a DOM):

```bash
cd sdk/extension && bun add -D happy-dom
```

```typescript
import { describe, expect, test, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { MinimalCursorWidget } from "../src/minimalCursorWidget";

let window: Window;

beforeEach(() => {
  window = new Window();
  // @ts-expect-error -- happy-dom's globals are close enough for this widget's DOM usage
  globalThis.document = window.document;
  // @ts-expect-error
  globalThis.HTMLElement = window.HTMLElement;
});

describe("MinimalCursorWidget", () => {
  test("mounts a cursor element hidden by default", () => {
    const widget = new MinimalCursorWidget();
    widget.mount();
    const cursor = window.document.querySelector('[data-skilly-cursor]');
    expect(cursor).not.toBeNull();
    expect(cursor?.getAttribute("data-visible")).toBe("false");
  });

  test("showCursor/hideCursor toggle visibility", () => {
    const widget = new MinimalCursorWidget();
    widget.mount();
    widget.showCursor();
    expect(window.document.querySelector('[data-skilly-cursor]')?.getAttribute("data-visible")).toBe("true");
    widget.hideCursor();
    expect(window.document.querySelector('[data-skilly-cursor]')?.getAttribute("data-visible")).toBe("false");
  });

  test("setCursorPosition updates the element's transform", () => {
    const widget = new MinimalCursorWidget();
    widget.mount();
    widget.setCursorPosition(100, 200);
    const cursor = window.document.querySelector('[data-skilly-cursor]') as HTMLElement;
    expect(cursor.style.transform).toContain("100");
    expect(cursor.style.transform).toContain("200");
  });

  test("showBanner displays text; hideBanner clears it", () => {
    const widget = new MinimalCursorWidget();
    widget.mount();
    widget.showBanner("Session limit reached.");
    const banner = window.document.querySelector('[data-skilly-banner]');
    expect(banner?.getAttribute("data-visible")).toBe("true");
    expect(banner?.textContent).toBe("Session limit reached.");
    widget.hideBanner();
    expect(window.document.querySelector('[data-skilly-banner]')?.getAttribute("data-visible")).toBe("false");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd sdk/extension && bun test tests/minimalCursorWidget.test.ts`
Expected: FAIL — `Cannot find module '../src/minimalCursorWidget'`.

- [ ] **Step 3: Implement `MinimalCursorWidget`**

```typescript
// The second CursorHost implementation (the first is SkillyWidget in sdk/web). Deliberately NOT
// shared with sdk/web: this has no launcher, no response bubble, no mic control — those mount
// once in the top frame only (Task 6's background/top-frame coordination), never per-frame.
// position: fixed inside THIS frame's own document is sufficient for correct on-screen placement
// even inside a cross-origin iframe — no cross-frame coordinate math needed (see the approved
// design's "Widget UI is split across frames" note).
import type { CursorHost } from "@skilly/browser-core";

const CURSOR_ICON = /* html */ `
<svg viewBox="0 0 1024 1024" aria-hidden="true" width="20" height="20">
  <path d="M367 165c0-42 47-67 82-43l440 299c38 26 27 85-18 94l-118 24c-32 7-45 46-22 69l170 169c22 22 22 57 0 79l-77 77c-23 23-60 21-81-4L586 746c-20-24-56-27-80-8L425 801c-34 27-84 3-84-40V216c0-28 10-41 26-51Z" fill="#2F6BFF"/>
</svg>`;

export class MinimalCursorWidget implements CursorHost {
  private cursorElement!: HTMLDivElement;
  private confirmElement!: HTMLDivElement;
  private bannerElement!: HTMLDivElement;
  private pendingConfirm: { resolve: (confirmed: boolean) => void; timeoutId: number } | null = null;

  mount(): void {
    this.cursorElement = document.createElement("div");
    this.cursorElement.setAttribute("data-skilly-cursor", "");
    this.cursorElement.setAttribute("data-visible", "false");
    this.cursorElement.style.position = "fixed";
    this.cursorElement.style.top = "0";
    this.cursorElement.style.left = "0";
    this.cursorElement.style.zIndex = "2147483647";
    this.cursorElement.style.pointerEvents = "none";
    this.cursorElement.innerHTML = CURSOR_ICON;
    document.body.appendChild(this.cursorElement);

    this.confirmElement = document.createElement("div");
    this.confirmElement.setAttribute("data-skilly-confirm", "");
    this.confirmElement.setAttribute("data-visible", "false");
    this.confirmElement.style.position = "fixed";
    this.confirmElement.style.zIndex = "2147483647";
    this.confirmElement.innerHTML = `
      <div data-skilly-confirm-copy></div>
      <button type="button" data-skilly-confirm-yes>Confirm</button>
      <button type="button" data-skilly-confirm-no>Cancel</button>
    `;
    this.confirmElement.querySelector("[data-skilly-confirm-yes]")?.addEventListener("click", () => this.finishConfirmation(true));
    this.confirmElement.querySelector("[data-skilly-confirm-no]")?.addEventListener("click", () => this.finishConfirmation(false));
    document.body.appendChild(this.confirmElement);

    this.bannerElement = document.createElement("div");
    this.bannerElement.setAttribute("data-skilly-banner", "");
    this.bannerElement.setAttribute("data-visible", "false");
    this.bannerElement.style.position = "fixed";
    this.bannerElement.style.top = "16px";
    this.bannerElement.style.left = "50%";
    this.bannerElement.style.transform = "translateX(-50%)";
    this.bannerElement.style.zIndex = "2147483647";
    document.body.appendChild(this.bannerElement);
  }

  showBanner(text: string): void {
    this.bannerElement.textContent = text;
    this.bannerElement.setAttribute("data-visible", "true");
  }

  hideBanner(): void {
    this.bannerElement.setAttribute("data-visible", "false");
  }

  showCursor(): void {
    this.cursorElement.setAttribute("data-visible", "true");
  }

  hideCursor(): void {
    this.cursorElement.setAttribute("data-visible", "false");
  }

  setCursorPosition(viewportX: number, viewportY: number): void {
    this.cursorElement.style.transform = `translate(${viewportX - 3}px, ${viewportY - 3}px)`;
  }

  confirmAction(label: string): Promise<boolean> {
    this.finishConfirmation(false);
    const copy = this.confirmElement.querySelector("[data-skilly-confirm-copy]");
    if (copy) {
      copy.textContent = `Let Skilly act on "${label}"?`;
    }
    this.confirmElement.setAttribute("data-visible", "true");
    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => this.finishConfirmation(false), 10_000);
      this.pendingConfirm = { resolve, timeoutId };
    });
  }

  private finishConfirmation(confirmed: boolean): void {
    const pending = this.pendingConfirm;
    this.pendingConfirm = null;
    this.confirmElement.setAttribute("data-visible", "false");
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timeoutId);
    pending.resolve(confirmed);
  }

  destroy(): void {
    this.finishConfirmation(false);
    this.cursorElement.remove();
    this.confirmElement.remove();
    this.bannerElement.remove();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd sdk/extension && bun test tests/minimalCursorWidget.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Implement the content script entrypoint**

```typescript
// entrypoints/content.ts — one instance per frame, including cross-origin iframes.
import { buildDomDigest, PointingEngine, ActionExecutor, parseActionRequest } from "@skilly/browser-core";
import { MinimalCursorWidget } from "../src/minimalCursorWidget";
import type { ContentToBackgroundMessage, BackgroundToContentMessage } from "../src/messages";

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  main(ctx) {
    // Skip skilly's own extension pages (offscreen.html, popup.html) if they were ever matched.
    if (location.protocol.startsWith("chrome-extension") || location.protocol.startsWith("moz-extension")) {
      return;
    }

    const widget = new MinimalCursorWidget();
    widget.mount();
    const pointing = new PointingEngine(widget);
    let currentRegistry = new Map<string, HTMLElement>();
    const actionExecutor = new ActionExecutor({
      getRegistry: () => currentRegistry,
      pointing,
      confirm: ({ elementLabel }) => widget.confirmAction(elementLabel),
      isSessionActive: () => true, // this frame's lifetime IS the session's lifetime for its content
    });

    function sendDigest(): void {
      const { digest, registry } = buildDomDigest();
      currentRegistry = registry;
      const message: ContentToBackgroundMessage = { type: "register-frame", frameId: ctx.instanceId, digest };
      chrome.runtime.sendMessage(message);
    }

    sendDigest();

    chrome.runtime.onMessage.addListener((rawMessage: BackgroundToContentMessage, _sender, sendResponse) => {
      if (rawMessage.type === "point-at") {
        void pointing.pointAt(rawMessage.target, rawMessage.label, currentRegistry);
        return;
      }
      if (rawMessage.type === "refresh-digest") {
        sendDigest();
        return;
      }
      if (rawMessage.type === "show-banner") {
        widget.showBanner(rawMessage.text);
        window.setTimeout(() => widget.hideBanner(), 6000);
        return;
      }
      if (rawMessage.type === "execute-action") {
        void actionExecutor.execute(rawMessage.request).then((result) => {
          const message: ContentToBackgroundMessage = {
            type: "action-result",
            frameId: ctx.instanceId,
            callId: rawMessage.callId,
            result,
          };
          chrome.runtime.sendMessage(message);
          sendResponse(result);
        });
        return true; // keep the message channel open for the async sendResponse
      }
    });

    ctx.onInvalidated(() => {
      pointing.clear();
      widget.destroy();
    });
  },
});
```

`ctx.instanceId` is WXT's content-script context id, stable for the lifetime of this injected
instance — used here as the `frameId` in every message, matching Task 2's `FrameRegistry` key
type (`number`).

- [ ] **Step 6: Commit**

```bash
git add sdk/extension/src/minimalCursorWidget.ts sdk/extension/entrypoints/content.ts sdk/extension/tests/minimalCursorWidget.test.ts sdk/extension/package.json
git commit -m "Add content script: per-frame digest, minimal cursor widget, action execution"
```

---

### Task 6: Background service worker — coordinator

**Files:**
- Create: `sdk/extension/src/auth.ts`
- Create: `sdk/extension/entrypoints/background.ts` (replaces Task 1's placeholder)
- Test: `sdk/extension/tests/auth.test.ts`

**Interfaces:**
- Consumes: `FrameRegistry` (Task 2), `matchSkillForUrl`/`BUNDLED_SKILLS` (Task 3), every message
  type (Task 4).
- Produces:
  `export function buildWorkOSAuthorizeUrl(clientId: string, redirectUri: string): string`
  `export async function exchangeCodeForSession(backendUrl: string, code: string): Promise<{ sessionToken: string; expiresAt: number; email: string }>`

- [ ] **Step 1: Write the failing test for the pure parts of `auth.ts`**

Create `sdk/extension/tests/auth.test.ts`:

```typescript
import { describe, expect, test, mock } from "bun:test";
import { buildWorkOSAuthorizeUrl, exchangeCodeForSession } from "../src/auth";

describe("buildWorkOSAuthorizeUrl", () => {
  test("builds a WorkOS authorize URL with the given client id and redirect uri", () => {
    const url = new URL(buildWorkOSAuthorizeUrl("client_abc", "https://ext-id.chromiumapp.org/"));
    expect(url.origin + url.pathname).toBe("https://api.workos.com/user_management/authorize");
    expect(url.searchParams.get("client_id")).toBe("client_abc");
    expect(url.searchParams.get("redirect_uri")).toBe("https://ext-id.chromiumapp.org/");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("provider")).toBe("authkit");
  });
});

describe("exchangeCodeForSession", () => {
  test("posts the code to the backend and returns the session", async () => {
    const fetchMock = mock(async () =>
      new Response(JSON.stringify({ sessionToken: "tok_abc", expiresAt: 123, email: "a@b.com" }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await exchangeCodeForSession("https://studio.tryskilly.app", "auth-code-123");
    expect(session).toEqual({ sessionToken: "tok_abc", expiresAt: 123, email: "a@b.com" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://studio.tryskilly.app/api/extension/auth/exchange");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: "auth-code-123" });
  });

  test("throws when the backend rejects the exchange", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "authentication failed" }), { status: 401 })) as unknown as typeof fetch;
    await expect(exchangeCodeForSession("https://studio.tryskilly.app", "bad-code")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd sdk/extension && bun test tests/auth.test.ts`
Expected: FAIL — `Cannot find module '../src/auth'`.

- [ ] **Step 3: Implement `auth.ts`**

```typescript
// WorkOS login for the extension. WORKOS_CLIENT_ID is a public identifier (safe to bake into
// extension config, same as how a tenant's publishable key works for @skilly/web) — the actual
// secret (WORKOS_API_KEY) never leaves the backend. The extension's own entrypoints/background.ts
// calls chrome.identity.launchWebAuthFlow with the URL this builds, captures the `code` from the
// redirect, and POSTs it to /api/extension/auth/exchange (Plan 2) via exchangeCodeForSession.
export function buildWorkOSAuthorizeUrl(clientId: string, redirectUri: string): string {
  const url = new URL("https://api.workos.com/user_management/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("provider", "authkit");
  return url.toString();
}

export interface ExtensionSessionResult {
  sessionToken: string;
  expiresAt: number;
  email: string;
}

export async function exchangeCodeForSession(backendUrl: string, code: string): Promise<ExtensionSessionResult> {
  const response = await fetch(`${backendUrl.replace(/\/$/, "")}/api/extension/auth/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    throw new Error(`extension auth exchange failed with ${response.status}`);
  }
  return (await response.json()) as ExtensionSessionResult;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd sdk/extension && bun test tests/auth.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Implement the background entrypoint**

```typescript
// entrypoints/background.ts — coordinator only. Never hosts the Realtime session (see the
// approved design: MV3 service workers have no getUserMedia/WebRTC and can be killed anytime;
// the offscreen document, created here, is what persists for a session's lifetime).
import { FrameRegistry, parseQualifiedTarget } from "../src/frameRegistry";
import { matchSkillForUrl } from "../src/skillMatcher";
import { BUNDLED_SKILLS } from "../src/bundledSkills";
import { buildWorkOSAuthorizeUrl, exchangeCodeForSession } from "../src/auth";
import type {
  ContentToBackgroundMessage,
  OffscreenToBackgroundMessage,
  BackgroundToOffscreenMessage,
  BackgroundToContentMessage,
  PopupToBackgroundMessage,
} from "../src/messages";

const BACKEND_URL = "https://studio.tryskilly.app"; // TODO(config): move to a build-time env var once staging/prod targets diverge
const WORKOS_CLIENT_ID = "client_REPLACE_ME"; // TODO(config): the real, public WorkOS client id

export default defineBackground(() => {
  const frameRegistry = new FrameRegistry();
  let activeTabId: number | null = null;
  const pendingActionFrames = new Map<string, number>(); // callId -> frameId, for routing results back

  async function ensureOffscreenDocument(): Promise<void> {
    const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType] });
    if (existing.length > 0) {
      return;
    }
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL("offscreen.html"),
      reasons: ["USER_MEDIA" as chrome.offscreen.Reason],
      justification: "Hosts the OpenAI Realtime voice session (microphone + WebRTC).",
    });
  }

  async function startSession(tabId: number): Promise<void> {
    activeTabId = tabId;
    frameRegistry.clear();

    const stored = await chrome.storage.local.get(["sessionToken", "actionsOverride"]);
    const sessionToken = stored.sessionToken as string | undefined;
    if (!sessionToken) {
      return; // not logged in — the popup owns prompting the user to sign in
    }

    const [entitlementResponse, tokenResponse] = await Promise.all([
      fetch(`${BACKEND_URL}/api/extension/entitlement`, { headers: { authorization: `Bearer ${sessionToken}` } }),
      fetch(`${BACKEND_URL}/api/extension/openai/token`, { headers: { authorization: `Bearer ${sessionToken}` } }),
    ]);
    if (!entitlementResponse.ok || !tokenResponse.ok) {
      activeTabId = null;
      const failureMessage: BackgroundToContentMessage = { type: "show-banner", text: "Skilly couldn't connect. Try again in a moment." };
      chrome.tabs.sendMessage(tabId, failureMessage);
      return;
    }
    const entitlement = (await entitlementResponse.json()) as { status: string };
    if (entitlement.status !== "active") {
      activeTabId = null;
      const noEntitlementMessage: BackgroundToContentMessage = { type: "show-banner", text: "Your Skilly subscription isn't active." };
      chrome.tabs.sendMessage(tabId, noEntitlementMessage);
      return;
    }
    const token = (await tokenResponse.json()) as { clientSecret: string; model: string };

    const tab = await chrome.tabs.get(tabId);
    const skill = tab.url ? matchSkillForUrl(tab.url, BUNDLED_SKILLS) : null;
    await chrome.tabs.sendMessage(tabId, { type: "refresh-digest" } satisfies BackgroundToContentMessage);
    // Give content scripts a moment to respond with register-frame before composing the prompt.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const instructions = [
      "You are Skilly, a browser extension companion. Help the user with the page they're on.",
      skill ? `--- ACTIVE SKILL: ${skill.name} ---\n${skill.content}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    await ensureOffscreenDocument();
    const startMessage: BackgroundToOffscreenMessage = {
      type: "start-session",
      clientSecret: token.clientSecret,
      model: token.model,
      instructions,
      actionsEnabled: true,
    };
    chrome.runtime.sendMessage(startMessage);
  }

  function stopSession(): void {
    activeTabId = null;
    frameRegistry.clear();
    pendingActionFrames.clear();
    chrome.runtime.sendMessage({ type: "stop-session" } satisfies BackgroundToOffscreenMessage);
  }

  // NOTE: chrome.action.onClicked is deliberately NOT used here. A WXT popup entrypoint (Task 8)
  // sets the manifest's action.default_popup, and Chrome never fires onClicked when a
  // default_popup is set — the popup opens instead. The popup's own "Start/Stop" button is the
  // only toggle entry point, reaching this file via the "toggle-session" message below.
  chrome.runtime.onMessage.addListener((message: PopupToBackgroundMessage, _sender, sendResponse) => {
    if (message.type === "toggle-session") {
      void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (!tab?.id) {
          sendResponse({ active: false });
          return;
        }
        if (activeTabId === tab.id) {
          stopSession();
          sendResponse({ active: false });
        } else {
          void startSession(tab.id).then(() => sendResponse({ active: activeTabId === tab.id }));
        }
      });
      return true; // async sendResponse
    }
    if (message.type === "get-session-status") {
      sendResponse({ active: activeTabId !== null });
      return;
    }
  });

  // Tab navigation ends the session — a fixed decision from the approved design, not a default
  // to reconsider here.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === activeTabId && changeInfo.status === "loading" && changeInfo.url) {
      stopSession();
    }
  });

  chrome.runtime.onMessage.addListener((rawMessage: ContentToBackgroundMessage | OffscreenToBackgroundMessage, sender) => {
    if (rawMessage.type === "register-frame") {
      frameRegistry.registerFrame(rawMessage.frameId, rawMessage.digest);
      return;
    }
    if (rawMessage.type === "action-result") {
      const outcome: BackgroundToOffscreenMessage = {
        type: "action-outcome",
        callId: rawMessage.callId,
        result: rawMessage.result,
      };
      chrome.runtime.sendMessage(outcome);
      pendingActionFrames.delete(rawMessage.callId);
      return;
    }
    if (rawMessage.type === "point-request") {
      const qualified = parseQualifiedTarget(rawMessage.target);
      if (!qualified || activeTabId === null) {
        return;
      }
      const pointMessage: BackgroundToContentMessage = { type: "point-at", target: qualified.localTarget, label: rawMessage.label };
      chrome.tabs.sendMessage(activeTabId, pointMessage, { frameId: qualified.frameId });
      return;
    }
    if (rawMessage.type === "action-request") {
      const qualified = parseQualifiedTarget(rawMessage.request.element_id);
      if (!qualified || activeTabId === null) {
        return;
      }
      pendingActionFrames.set(rawMessage.callId, qualified.frameId);
      const executeMessage: BackgroundToContentMessage = {
        type: "execute-action",
        callId: rawMessage.callId,
        request: { ...rawMessage.request, element_id: qualified.localTarget },
      };
      chrome.tabs.sendMessage(activeTabId, executeMessage, { frameId: qualified.frameId });
      return;
    }
    if (rawMessage.type === "usage-report") {
      void chrome.storage.local.get(["sessionToken"]).then(({ sessionToken }) => {
        if (!sessionToken) {
          return;
        }
        void fetch(`${BACKEND_URL}/api/extension/usage`, {
          method: "POST",
          headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
          body: JSON.stringify({ seconds: rawMessage.seconds }),
        });
      });
      return;
    }
  });

  // Exposed for the popup (Task 7) via chrome.runtime.sendMessage — kept here rather than in a
  // separate file since it is a one-line wrapper around functions this file already imports.
  chrome.runtime.onMessage.addListener((message: { type: string; code?: string }, _sender, sendResponse) => {
    if (message.type === "login-start") {
      const redirectUri = chrome.identity.getRedirectURL();
      const authorizeUrl = buildWorkOSAuthorizeUrl(WORKOS_CLIENT_ID, redirectUri);
      chrome.identity.launchWebAuthFlow({ url: authorizeUrl, interactive: true }, (responseUrl) => {
        if (!responseUrl) {
          sendResponse({ ok: false });
          return;
        }
        const code = new URL(responseUrl).searchParams.get("code");
        if (!code) {
          sendResponse({ ok: false });
          return;
        }
        exchangeCodeForSession(BACKEND_URL, code)
          .then((session) => chrome.storage.local.set({ sessionToken: session.sessionToken, email: session.email }))
          .then(() => sendResponse({ ok: true }))
          .catch(() => sendResponse({ ok: false }));
      });
      return true; // keep the channel open for the async sendResponse
    }
  });
});
```

`chrome.runtime.getContexts` and the `USER_MEDIA` offscreen reason are the documented Manifest V3
APIs for this exact pattern (detecting an existing offscreen document, and declaring why one is
needed) — both require the `offscreen` permission already added to the manifest in Task 1.

- [ ] **Step 6: Build and manually verify the background script loads without console errors**

Run: `cd sdk/extension && bun run dev`, load the unpacked extension from `.output/chrome-mv3-dev`
into `chrome://extensions` (Developer mode → Load unpacked), and check the service worker's
console (via the extension's "service worker" link on that page) for errors. `startSession` will
fail gracefully (early return) since there is no real session token yet — that is expected until
Task 7 (popup login) exists; the check here is only "no thrown errors, no red badge."

- [ ] **Step 7: Commit**

```bash
git add sdk/extension/src/auth.ts sdk/extension/entrypoints/background.ts sdk/extension/tests/auth.test.ts
git commit -m "Add background service worker: coordinator, WorkOS login, message routing"
```

---

### Task 7: Offscreen document — the Realtime session host

**Files:**
- Create: `sdk/extension/entrypoints/offscreen.html`
- Create: `sdk/extension/entrypoints/offscreen/main.ts`

**Interfaces:**
- Consumes: `RealtimeSession`, `type RealtimeActionToolCall`, `parseActionRequest`, `type ActionResult`, `loadCore` from `@skilly/browser-core`; every message type from Task 4.

Per WXT's documented entrypoint rule ("DO NOT put files related to an entrypoint directly inside
`entrypoints/`; use a directory"), this uses the directory form:
`entrypoints/offscreen/index.html` — adjust the file paths below accordingly if a flat
`entrypoints/offscreen.html` is used instead (both are valid per WXT's docs; the directory form
is chosen here so `main.ts` can sit next to its HTML without WXT mistaking it for a second
entrypoint).

- [ ] **Step 1: Create the offscreen HTML shell**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Skilly (offscreen)</title>
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

Write this to `sdk/extension/entrypoints/offscreen/index.html`.

- [ ] **Step 2: Implement the offscreen document's session logic**

No unit test for this file — per `@skilly/browser-core/realtime.ts`'s own existing convention
("validated by build + a live session, not by headless unit tests"), this file is validated the
same way: a real browser, a real microphone, a real Realtime connection (Task 9's manual
verification).

```typescript
// entrypoints/offscreen/main.ts — hosts the Realtime session for the extension's active tab.
// Persists independently of the background service worker's lifecycle (a worker restart just
// needs to re-register listeners; this document and its live session are untouched).
import { RealtimeSession, parseActionRequest, type RealtimeActionToolCall, type ActionResult } from "@skilly/browser-core";
import type { BackgroundToOffscreenMessage, OffscreenToBackgroundMessage } from "../../src/messages";

let session: RealtimeSession | null = null;
let sessionStartedAt = 0;
let actionsExecuted = 0;
let actionsRefused = 0;
const pendingActionResolvers = new Map<string, (result: ActionResult) => void>();

function post(message: OffscreenToBackgroundMessage): void {
  chrome.runtime.sendMessage(message);
}

function startSession(payload: Extract<BackgroundToOffscreenMessage, { type: "start-session" }>): void {
  session?.close();
  sessionStartedAt = Date.now();
  actionsExecuted = 0;
  actionsRefused = 0;

  session = new RealtimeSession({
    clientSecret: payload.clientSecret,
    model: payload.model,
    instructions: payload.instructions,
    actions: payload.actionsEnabled,
    callbacks: {
      onStateChange: (state) => post({ type: "session-state", state }),
      onUserTranscript: () => {},
      onAssistantText: (text) => post({ type: "assistant-text", text }),
      onActionToolCall: (call: RealtimeActionToolCall) => {
        void handleActionToolCall(call);
      },
      onError: () => post({ type: "session-state", state: "error" }),
    },
  });
  void session.connect();
}

async function handleActionToolCall(call: RealtimeActionToolCall): Promise<void> {
  if (!session) {
    return;
  }
  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(call.argumentsJson);
  } catch {
    session.sendFunctionCallOutput(call.callId, JSON.stringify({ ok: false, error: "unsupported_target" }));
    return;
  }
  const request = parseActionRequest(parsedArguments);
  if (!request) {
    session.sendFunctionCallOutput(call.callId, JSON.stringify({ ok: false, error: "unsupported_target" }));
    return;
  }

  const result = await new Promise<ActionResult>((resolve) => {
    pendingActionResolvers.set(call.callId, resolve);
    post({ type: "action-request", callId: call.callId, request });
  });
  if (result.ok) {
    actionsExecuted += 1;
  } else {
    actionsRefused += 1;
  }
  session.sendFunctionCallOutput(call.callId, JSON.stringify(result));
}

function stopSession(): void {
  if (session) {
    const elapsedSeconds = sessionStartedAt ? (Date.now() - sessionStartedAt) / 1000 : 0;
    if (elapsedSeconds > 0) {
      post({ type: "usage-report", seconds: elapsedSeconds, actionsExecuted, actionsRefused });
    }
  }
  session?.close();
  session = null;
  sessionStartedAt = 0;
  actionsExecuted = 0;
  actionsRefused = 0;
}

chrome.runtime.onMessage.addListener((message: BackgroundToOffscreenMessage) => {
  if (message.type === "start-session") {
    startSession(message);
  } else if (message.type === "stop-session") {
    stopSession();
  } else if (message.type === "action-outcome") {
    pendingActionResolvers.get(message.callId)?.(message.result);
    pendingActionResolvers.delete(message.callId);
  }
});
```

- [ ] **Step 3: Build and manually smoke-test**

Run: `cd sdk/extension && bun run dev`, reload the unpacked extension, click the toolbar icon on
any real page while signed out — confirm (via the offscreen document's own devtools, opened by
inspecting `chrome://extensions` → the extension's "Inspect views: offscreen.html" link if
present) that no uncaught errors appear. A full live session requires Task 6's login to work end
to end first (Task 9 covers that).

- [ ] **Step 4: Commit**

```bash
git add sdk/extension/entrypoints/offscreen/
git commit -m "Add offscreen document: Realtime session host"
```

---

### Task 8: Popup — login, entitlement status, skill override

**Files:**
- Create: `sdk/extension/entrypoints/popup/index.html`
- Create: `sdk/extension/entrypoints/popup/main.ts`

**Interfaces:** Consumes `BUNDLED_SKILLS` (Task 3), `chrome.storage.local` (written by the
background worker in Task 6), and three messages the background worker (Task 6) handles:
`{ type: "login-start" }`, `{ type: "toggle-session" }` (the popup's own Start/Stop button is the
extension's only session toggle — see the note in Task 6 about why `chrome.action.onClicked`
cannot be used once a popup exists), and `{ type: "get-session-status" }`.

- [ ] **Step 1: Create the popup HTML**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Skilly</title>
    <style>
      body { width: 260px; font-family: system-ui, sans-serif; padding: 12px; }
      button { width: 100%; padding: 8px; margin-top: 8px; cursor: pointer; }
      select { width: 100%; margin-top: 4px; }
    </style>
  </head>
  <body>
    <div id="signed-out">
      <p>Sign in to use Skilly.</p>
      <button type="button" id="sign-in">Sign in</button>
    </div>
    <div id="signed-in" style="display: none;">
      <p id="email"></p>
      <label for="skill-override">Skill</label>
      <select id="skill-override"></select>
      <button type="button" id="toggle-session"></button>
      <button type="button" id="sign-out">Sign out</button>
    </div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Implement the popup script**

```typescript
import { BUNDLED_SKILLS } from "../../src/bundledSkills";
import type { PopupToBackgroundMessage } from "../../src/messages";

async function render(): Promise<void> {
  const stored = await chrome.storage.local.get(["sessionToken", "email", "skillOverride"]);
  const signedOutSection = document.getElementById("signed-out")!;
  const signedInSection = document.getElementById("signed-in")!;

  if (!stored.sessionToken) {
    signedOutSection.style.display = "block";
    signedInSection.style.display = "none";
    return;
  }

  signedOutSection.style.display = "none";
  signedInSection.style.display = "block";
  document.getElementById("email")!.textContent = (stored.email as string) ?? "";

  const select = document.getElementById("skill-override") as HTMLSelectElement;
  select.innerHTML = "";
  const autoOption = document.createElement("option");
  autoOption.value = "";
  autoOption.textContent = "Auto-detect";
  select.appendChild(autoOption);
  for (const skill of BUNDLED_SKILLS) {
    const option = document.createElement("option");
    option.value = skill.id;
    option.textContent = skill.name;
    select.appendChild(option);
  }
  const genericOption = document.createElement("option");
  genericOption.value = "generic";
  genericOption.textContent = "Generic (this page)";
  select.appendChild(genericOption);
  select.value = (stored.skillOverride as string) ?? "";

  const statusMessage: PopupToBackgroundMessage = { type: "get-session-status" };
  chrome.runtime.sendMessage(statusMessage, (response: { active: boolean } | undefined) => {
    const toggleButton = document.getElementById("toggle-session") as HTMLButtonElement;
    toggleButton.textContent = response?.active ? "Stop on this page" : "Start on this page";
  });
}

document.getElementById("sign-in")!.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "login-start" }, () => {
    void render();
  });
});

document.getElementById("sign-out")!.addEventListener("click", () => {
  void chrome.storage.local.remove(["sessionToken", "email"]).then(render);
});

document.getElementById("toggle-session")!.addEventListener("click", () => {
  const toggleMessage: PopupToBackgroundMessage = { type: "toggle-session" };
  chrome.runtime.sendMessage(toggleMessage, () => {
    void render();
  });
});

document.getElementById("skill-override")!.addEventListener("change", (event) => {
  const value = (event.target as HTMLSelectElement).value;
  void chrome.storage.local.set({ skillOverride: value || null });
});

void render();
```

- [ ] **Step 3: Build and manually verify**

Run: `cd sdk/extension && bun run dev`, reload the extension, click the toolbar icon to open the
popup — confirm the signed-out view renders, and that clicking "Sign in" opens a WorkOS login tab
via `chrome.identity.launchWebAuthFlow` (it will fail to complete until `WORKOS_CLIENT_ID` in
`entrypoints/background.ts` is replaced with the real value and that redirect URI is registered
in the WorkOS dashboard — both are configuration steps for Task 9, not code). Confirm the
"Start on this page" button is present once signed in (it can be manually tested end to end only
after Task 9's configuration step, but its label should correctly read "Start on this page"
before a session and "Stop on this page" after one, via the `get-session-status` round trip).

- [ ] **Step 4: Commit**

```bash
git add sdk/extension/entrypoints/popup/
git commit -m "Add popup: login, entitlement status, skill override"
```

---

### Task 9: Configuration, end-to-end manual verification, and Playwright integration test

**Files:**
- Modify: `sdk/extension/entrypoints/background.ts` (replace the two `TODO(config)` placeholders)
- Create: `sdk/extension/tests-e2e/basic-flow.spec.ts`

**Interfaces:** None new — this task wires real configuration values and proves the whole system
works together.

- [ ] **Step 1: Register the extension's WorkOS redirect URI**

Load the unpacked extension (`bun run build` then load `.output/chrome-mv3` in
`chrome://extensions`, Developer mode) to get its real, stable extension ID (or set a fixed `key`
in the manifest via `wxt.config.ts`'s `manifest.key` for a deterministic dev ID — recommended, so
this redirect URI does not change every reload). Compute the redirect URL:
`chrome.identity.getRedirectURL()` (visible by logging it once from the background console) — it
will be `https://<extension-id>.chromiumapp.org/`. Register this URI in the WorkOS dashboard
(manual, out-of-band, same as Plan 2 Task 5's manual WorkOS configuration step).

- [ ] **Step 2: Replace the placeholder constants in `entrypoints/background.ts`**

Replace:
```typescript
const BACKEND_URL = "https://studio.tryskilly.app"; // TODO(config): ...
const WORKOS_CLIENT_ID = "client_REPLACE_ME"; // TODO(config): ...
```
with the real values (`WORKOS_CLIENT_ID` is public — safe to commit; confirm this against the
`WORKOS_CLIENT_ID` value already used by `apps/web-backend`'s own dashboard auth, since it is the
same WorkOS application, just a new redirect URI added to it, not a new WorkOS app).

- [ ] **Step 3: Full manual round-trip**

With Plan 2's routes live (staging or local `apps/web-backend`) and the extension loaded:
1. Click "Sign in" in the popup, complete a real WorkOS login.
2. Confirm the popup switches to the signed-in view with the correct email.
3. On a real webpage, click the toolbar icon — confirm the offscreen document's console shows a
   `state: "connecting"` then `state: "live"` progression (requires an active entitlement from
   Plan 2's real backend — a test account will need `mac_entitlements.status = 'active'` set
   directly in Postgres for this manual pass, since there is no checkout flow for the extension
   in this plan).
4. Speak a request referencing something on the page; confirm the cursor animates to it.
5. Ask it to click something; confirm the confirm-by-default behavior only appears for
   destructive-flagged/keyword-matched actions (decision 6), and the click actually executes.
6. Build a small test page with a cross-origin iframe (two static HTML files on two different
   local ports); confirm pointing/actions reach an element inside the iframe.
7. Navigate the tab to a new URL mid-session; confirm the session ends cleanly (offscreen
   document logs a close, no error).

- [ ] **Step 4: Add a Playwright integration test for the parts that don't need a live backend**

```typescript
// sdk/extension/tests-e2e/basic-flow.spec.ts
// Covers what can be verified without a live OpenAI/WorkOS round-trip: the extension loads,
// the popup renders its signed-out state, and a content script actually mounts on a real page.
import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";

let context: BrowserContext;

test.beforeAll(async () => {
  const pathToExtension = path.join(__dirname, "../.output/chrome-mv3");
  context = await chromium.launchPersistentContext("", {
    headless: false, // MV3 extensions require a headed context in current Playwright/Chromium
    args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
  });
});

test.afterAll(async () => {
  await context.close();
});

test("content script mounts a hidden cursor element on a real page", async () => {
  const page = await context.newPage();
  await page.goto("https://example.com");
  const cursor = page.locator("[data-skilly-cursor]");
  await expect(cursor).toBeAttached();
  await expect(cursor).toHaveAttribute("data-visible", "false");
});
```

Add to `sdk/extension/package.json`'s `devDependencies`: `"@playwright/test": "^1.48.0"`, and a
script: `"test:e2e": "bun run build && playwright test"`.

- [ ] **Step 5: Run the Playwright test**

Run: `cd sdk/extension && bun install && bun run test:e2e`
Expected: PASS. If Playwright's browsers are not installed in this environment, run
`bunx playwright install chromium` first — note this in the task if it happens, it is a one-time
environment setup step, not a plan defect.

- [ ] **Step 6: Commit**

```bash
git add sdk/extension/entrypoints/background.ts sdk/extension/tests-e2e/ sdk/extension/package.json
git commit -m "Configure WorkOS client id/backend URL, add Playwright smoke test"
```

---

### Task 10 (follow-on, not part of this plan's scope): Firefox parity pass and Safari packaging

Both are explicitly deferred, per the approved design's sequencing note and this plan's Global
Constraints:

- **Firefox**: `bun run build:firefox` was verified to produce output in Task 1, but no manual
  pass through the full login → session → action flow has been run in Firefox specifically —
  `chrome.offscreen` and `chrome.identity.launchWebAuthFlow` have Firefox equivalents
  (`browser.offscreen`, `browser.identity`) that WXT's `browser` polyfill is expected to bridge,
  but this needs its own verification pass before Firefox is considered shipped, not assumed from
  the Chrome pass.
- **Safari**: needs `xcrun safari-web-extension-converter` run against the Chrome build output,
  Xcode project packaging, an Apple Developer account, and App Store review — a distinct project,
  not a task in this plan. Do not start it until Chrome and Firefox have both shipped.
