# Browser Core Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the browser-generic logic in `@skilly/web` (DOM digest, pointing, actions,
prompt composition, Realtime session, wasm loader) into a new standalone package,
`sdk/browser-core`, so the future Skilly browser extension can consume the exact same code
instead of duplicating it — with zero behavior change to the shipped widget.

**Architecture:** This repo has no npm/bun workspaces — every package under `sdk/` and `apps/`
is independent with its own lockfile. `sdk/browser-core` becomes a new sibling package consumed
via a `file:` dependency (bun/npm both resolve `file:../browser-core` as a local symlink, no
workspaces config needed). It ships TypeScript source directly (no build step, no `dist/`) —
`sdk/web`'s `tsup` (esbuild-based) and the future extension's Vite-based bundler both compile
`.ts` sources directly through bundler-aware module resolution, so a separate compile step for
this internal-only package would be pure overhead.

**Tech Stack:** TypeScript (ES2020, strict), Bun (`bun test`, package management), no new
runtime dependencies.

## Global Constraints

- No new runtime dependencies in either package.
- `sdk/browser-core` must not import anything from `sdk/web` (dependency direction is
  one-way: `sdk/web` depends on `sdk/browser-core`, never the reverse).
- Zero behavior change to `@skilly/web`'s shipped output — this is a pure extraction plus one
  small, explicitly-justified interface decoupling (Task 2). If `sdk/web`'s existing test suite,
  typecheck, or build output changes in any way other than import paths, that's a bug in this
  plan's execution, not an intended improvement.
- Match existing code style: no comments explaining *what* code does, only non-obvious *why*;
  `verbatimModuleSyntax` means all type-only imports use `import type`.

---

### Task 1: Scaffold the `sdk/browser-core` package

**Files:**
- Create: `sdk/browser-core/package.json`
- Create: `sdk/browser-core/tsconfig.json`
- Create: `sdk/browser-core/src/index.ts` (empty barrel for now)
- Create: `sdk/browser-core/README.md`

**Interfaces:**
- Produces: an installable, typecheckable, testable empty package at `@skilly/browser-core`
  that later tasks populate.

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "@skilly/browser-core",
  "version": "0.1.0",
  "private": true,
  "description": "Browser-generic Skilly logic (DOM digest, pointing, actions, prompt composition, Realtime session, wasm core loader) shared between @skilly/web and the Skilly browser extension.",
  "type": "module",
  "main": "./src/index.ts",
  "module": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "bun-types": "^1.2.0",
    "typescript": "^5.6.0"
  }
}
```

Write this to `sdk/browser-core/package.json`.

- [ ] **Step 2: Create the TypeScript config**

Copy `sdk/web/tsconfig.json` verbatim to `sdk/browser-core/tsconfig.json` — same compiler
options apply (this package has the identical browser/DOM/ES2020 target as `sdk/web`):

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "declaration": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"],
  "exclude": ["dist", "generated", "node_modules"]
}
```

- [ ] **Step 3: Create an empty barrel entry point**

```typescript
// @skilly/browser-core — browser-generic Skilly logic shared between the embeddable widget
// (@skilly/web) and the Skilly browser extension. No UI, no tenant/auth concerns — those stay
// in each consumer. Populated by the extraction tasks in this plan.
export {};
```

Write this to `sdk/browser-core/src/index.ts`.

- [ ] **Step 4: Create the package README**

```markdown
# @skilly/browser-core

Browser-generic Skilly logic shared between `@skilly/web` (the embeddable widget) and the
Skilly browser extension: DOM digest, selector-based pointing, the click/fill action executor,
Realtime session (WebRTC to OpenAI), prompt composition, and the wasm core loader.

No UI, no tenant/auth/billing concerns — those are each consumer's own responsibility.

Consumed via a local `file:` dependency (this repo has no workspaces config):
`"@skilly/browser-core": "file:../browser-core"`. Ships TypeScript source directly; consumers'
bundlers (tsup, Vite) compile it, so there is no separate build step here.
```

Write this to `sdk/browser-core/README.md`.

- [ ] **Step 5: Verify the empty package installs and typechecks**

Run:
```bash
cd sdk/browser-core && bun install && bun run typecheck
```
Expected: `bun install` succeeds (no dependencies to resolve besides the two devDependencies),
`tsc --noEmit` reports no errors.

- [ ] **Step 6: Commit**

```bash
git add sdk/browser-core/
git commit -m "Scaffold sdk/browser-core package (empty)"
```

---

### Task 2: Decouple `PointingEngine` from the concrete `SkillyWidget` class

**Why this task exists:** `pointing.ts` currently does
`import type { SkillyWidget } from "./widget.js"` and `PointingEngine`'s constructor takes a
concrete `SkillyWidget`. Once `pointing.ts` moves into `sdk/browser-core`, it cannot import from
`sdk/web/src/widget.ts` (that would violate the one-way dependency direction in Global
Constraints, and `widget.ts` is staying in `sdk/web` — the extension's own minimal per-frame
cursor UI, a future consumer, is not a `SkillyWidget`). `PointingEngine` only ever calls three
methods on it: `showCursor()`, `hideCursor()`, `setCursorPosition(x, y)`. This task replaces the
concrete-class dependency with a three-method interface, done and verified **before** the file
moves anywhere, against the existing, known-good `sdk/web` test suite.

**Files:**
- Modify: `sdk/web/src/pointing.ts:9-11` (imports), `:119-130` (constructor)
- Modify: `sdk/web/src/widget.ts:22` (class declaration — implement the interface explicitly)
- Test: `sdk/web/tests/pointing.test.ts` (add a new test)

**Interfaces:**
- Produces: `export interface CursorHost { showCursor(): void; hideCursor(): void;
  setCursorPosition(viewportX: number, viewportY: number): void; }`, exported from `pointing.ts`.
  `PointingEngine`'s constructor becomes `constructor(private widget: CursorHost)`.

- [ ] **Step 1: Write a failing test proving `PointingEngine` doesn't need a real `SkillyWidget`**

Add to `sdk/web/tests/pointing.test.ts` (append; keep the existing three `describe` blocks
unchanged):

```typescript
import { PointingEngine } from "../src/pointing";

describe("PointingEngine construction", () => {
  test("accepts a plain object satisfying the CursorHost shape, not a real SkillyWidget", () => {
    let hideCalled = false;
    const fakeCursorHost = {
      showCursor: () => {},
      hideCursor: () => {
        hideCalled = true;
      },
      setCursorPosition: (_x: number, _y: number) => {},
    };
    const engine = new PointingEngine(fakeCursorHost);
    engine.clear();
    expect(hideCalled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd sdk/web && bun test tests/pointing.test.ts`
Expected: FAIL — TypeScript error, `fakeCursorHost` is not assignable to parameter of type
`SkillyWidget` (missing the class's other members: `mount`, `setState`, `setBubbleText`, etc.).

- [ ] **Step 3: Add the `CursorHost` interface and update `PointingEngine`**

In `sdk/web/src/pointing.ts`, replace line 11 (`import type { SkillyWidget } from "./widget.js";`)
— delete it entirely — and add this interface directly below the existing `ResolvedPoint`
interface (after line 23, before the `POINT_TAG_PATTERN` constant):

```typescript
/** The three cursor-rendering methods PointingEngine needs from its host — deliberately not
 *  the concrete SkillyWidget class, so a minimal per-frame overlay can satisfy this too. */
export interface CursorHost {
  showCursor(): void;
  hideCursor(): void;
  setCursorPosition(viewportX: number, viewportY: number): void;
}
```

Then change the constructor signature (currently `constructor(private widget: SkillyWidget) {`)
to:

```typescript
  constructor(private widget: CursorHost) {
```

No other line in `pointing.ts` changes — every existing call site (`this.widget.showCursor()`,
`this.widget.setCursorPosition(x, y)`, `this.widget.hideCursor()`) already matches this
interface exactly.

- [ ] **Step 4: Make `SkillyWidget`'s conformance explicit**

In `sdk/web/src/widget.ts`, add the import and update the class declaration:

```typescript
import type { CursorHost } from "./pointing.js";
```//

Add this import near the top (after the existing `import type { SkillyState } from "./types.js";`
line). Change line 22 from `export class SkillyWidget {` to:

```typescript
export class SkillyWidget implements CursorHost {
```

This is not required for the code to work (structural typing already satisfies the interface) —
it's a one-line safeguard so any future accidental signature drift in `showCursor`/`hideCursor`/
`setCursorPosition` becomes a compile error in `widget.ts` itself, at the point of the mistake,
rather than a confusing error in `pointing.ts`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd sdk/web && bun test tests/pointing.test.ts`
Expected: PASS, including the new `PointingEngine construction` test.

- [ ] **Step 6: Run the full existing suite and typecheck to confirm zero regressions**

Run: `cd sdk/web && bun test && bun run typecheck && bun run build`
Expected: same pass count as before this task (26 pass, 0 fail), `tsc --noEmit` clean, build
succeeds. `SkillyWidget` is passed into `new PointingEngine(this.widget)` in `src/index.ts`
unchanged — it now satisfies `CursorHost` both structurally and via the explicit `implements`.

- [ ] **Step 7: Commit**

```bash
git add sdk/web/src/pointing.ts sdk/web/src/widget.ts sdk/web/tests/pointing.test.ts
git commit -m "Decouple PointingEngine from the concrete SkillyWidget class via CursorHost"
```

---

### Task 3: Move the browser-generic modules into `sdk/browser-core`

**Files:**
- Move: `sdk/web/src/digest.ts` → `sdk/browser-core/src/digest.ts`
- Move: `sdk/web/src/pointing.ts` → `sdk/browser-core/src/pointing.ts`
- Move: `sdk/web/src/actions.ts` → `sdk/browser-core/src/actions.ts`
- Move: `sdk/web/src/prompt.ts` → `sdk/browser-core/src/prompt.ts`
- Move: `sdk/web/src/realtime.ts` → `sdk/browser-core/src/realtime.ts`
- Move: `sdk/web/src/core.ts` → `sdk/browser-core/src/core.ts`
- Move: `sdk/web/tests/digest.test.ts` if it exists (it does not currently — confirmed via
  `ls sdk/web/tests/`: only `actions.test.ts`, `pointing.test.ts`, `prompt.test.ts`,
  `token.test.ts` exist; there is no `digest.test.ts` or `realtime.test.ts` or `core.test.ts`
  today — nothing to move for those)
- Move: `sdk/web/tests/actions.test.ts` → `sdk/browser-core/tests/actions.test.ts`
- Move: `sdk/web/tests/pointing.test.ts` → `sdk/browser-core/tests/pointing.test.ts`
- Move: `sdk/web/tests/prompt.test.ts` → `sdk/browser-core/tests/prompt.test.ts`
- Do NOT move: `sdk/web/src/widget.ts`, `sdk/web/src/styles.ts`, `sdk/web/src/token.ts`,
  `sdk/web/src/index.ts`, `sdk/web/src/types.ts`, `sdk/web/tests/token.test.ts` — these stay in
  `sdk/web` (widget/styles are the shipped widget's own UI; `token.ts` is the tenant-key backend
  client, explicitly "adapted, not shared" per the design)

**Interfaces:**
- Consumes: nothing new — this task moves files whose content does not change (Task 2 already
  landed the one content change `pointing.ts` needed).
- Produces: the six files above, byte-identical to their pre-move content, now living in
  `sdk/browser-core/src/` and `sdk/browser-core/tests/`. Confirmed import graph among them (so
  no relative-import strings need to change): `digest.ts` has no local imports; `pointing.ts`
  imports `./digest.js`; `actions.ts` imports `./digest.js` and `./pointing.js`; `prompt.ts`
  imports `./digest.js`; `realtime.ts` and `core.ts` have no local imports. Since all six move
  together into the same directory, every one of these relative import strings stays correct
  with zero edits.

- [ ] **Step 1: Move the six source files with `git mv` (preserves history, exact content)**

```bash
git mv sdk/web/src/digest.ts sdk/browser-core/src/digest.ts
git mv sdk/web/src/pointing.ts sdk/browser-core/src/pointing.ts
git mv sdk/web/src/actions.ts sdk/browser-core/src/actions.ts
git mv sdk/web/src/prompt.ts sdk/browser-core/src/prompt.ts
git mv sdk/web/src/realtime.ts sdk/browser-core/src/realtime.ts
git mv sdk/web/src/core.ts sdk/browser-core/src/core.ts
```

- [ ] **Step 2: Move the three corresponding test files, then fix their import paths**

```bash
git mv sdk/web/tests/actions.test.ts sdk/browser-core/tests/actions.test.ts
git mv sdk/web/tests/pointing.test.ts sdk/browser-core/tests/pointing.test.ts
git mv sdk/web/tests/prompt.test.ts sdk/browser-core/tests/prompt.test.ts
```

Each test file imports its subject with a relative path like `"../src/pointing"` — since the
test file and its subject move together (same relative position: `tests/x.test.ts` next to
`src/x.ts`), these relative import strings do **not** need to change. Confirm this by opening
each moved test file and checking its import lines still read `"../src/actions"`,
`"../src/pointing"`, `"../src/digest"`, `"../src/prompt"` — if any test imports a sibling
subject file by a path that assumed `sdk/web/src/`'s layout, fix it now, but based on the
current content none do.

- [ ] **Step 3: Populate the barrel export**

Replace the contents of `sdk/browser-core/src/index.ts` (from Task 1) with:

```typescript
// @skilly/browser-core — browser-generic Skilly logic shared between the embeddable widget
// (@skilly/web) and the Skilly browser extension. No UI, no tenant/auth concerns — those stay
// in each consumer.
export * from "./digest.js";
export * from "./pointing.js";
export * from "./actions.js";
export * from "./prompt.js";
export * from "./realtime.js";
export * from "./core.js";
```

- [ ] **Step 4: Run the moved test suite and typecheck inside `sdk/browser-core`**

Run:
```bash
cd sdk/browser-core && bun test && bun run typecheck
```
Expected: the same tests that passed in `sdk/web` before this task now pass here — 19 tests
across `actions.test.ts`, `pointing.test.ts`, `prompt.test.ts` combined (per the current
`sdk/web` suite: `actions.test.ts` contributes the action-guardrail tests, `pointing.test.ts`
contributes `parsePointTags`/`inferPointFromText`/the new `PointingEngine construction` test from
Task 2, `prompt.test.ts` contributes the prompt-composition tests). `tsc --noEmit` reports no
errors.

- [ ] **Step 5: Commit**

```bash
git add sdk/browser-core/ sdk/web/
git commit -m "Move digest/pointing/actions/prompt/realtime/core into sdk/browser-core"
```

---

### Task 4: Wire `sdk/web` to consume `@skilly/browser-core`

**Files:**
- Modify: `sdk/web/package.json` (add the dependency)
- Modify: `sdk/web/src/index.ts:16-23` (internal import block) and `sdk/web/src/index.ts:~510`
  (public type re-export — a second, separate reference to the old paths, easy to miss)
- Modify: `sdk/web/src/widget.ts` (import of `CursorHost`, from Task 2, now comes from the new
  package instead of the sibling file)

**Interfaces:**
- Consumes: `@skilly/browser-core`'s full barrel export (Task 3) — every name `sdk/web/src/
  index.ts` and `sdk/web/src/widget.ts` previously imported from `./digest.js`, `./pointing.js`,
  `./actions.js`, `./prompt.js`, `./realtime.js`, `./core.js` is now available from
  `"@skilly/browser-core"`.

- [ ] **Step 1: Add the local `file:` dependency**

In `sdk/web/package.json`, add to `dependencies` (this key does not exist yet — add it as a new
top-level key, positioned before `devDependencies`):

```json
  "dependencies": {
    "@skilly/browser-core": "file:../browser-core"
  },
```

- [ ] **Step 2: Install it**

Run: `cd sdk/web && bun install`
Expected: `bun.lock` gains an entry for `@skilly/browser-core`, resolved as a local symlink;
`node_modules/@skilly/browser-core` exists and resolves to `../../sdk/browser-core`.

- [ ] **Step 3: Update the import block in `sdk/web/src/index.ts`**

Replace lines 16–23:

```typescript
import { loadCore } from "./core.js";
import { SkillyWidget } from "./widget.js";
import { buildDomDigest, type DomDigest, type ElementRegistry } from "./digest.js";
import { inferPointFromText, parsePointTags, PointingEngine } from "./pointing.js";
import { fetchSessionToken, fetchTenantSkill, reportSessionUsage } from "./token.js";
import { buildCompanionInstructions } from "./prompt.js";
import { RealtimeSession, type RealtimeActionToolCall, type RealtimeState } from "./realtime.js";
import { ActionExecutor, parseActionRequest, type ActionResult } from "./actions.js";
```

with:

```typescript
import { SkillyWidget } from "./widget.js";
import { fetchSessionToken, fetchTenantSkill, reportSessionUsage } from "./token.js";
import {
  loadCore,
  buildDomDigest,
  type DomDigest,
  type ElementRegistry,
  inferPointFromText,
  parsePointTags,
  PointingEngine,
  buildCompanionInstructions,
  RealtimeSession,
  type RealtimeActionToolCall,
  type RealtimeState,
  ActionExecutor,
  parseActionRequest,
  type ActionResult,
} from "@skilly/browser-core";
```

Every other line in the internal import block is unchanged — all of these names are used exactly
as before, only their import source moved.

- [ ] **Step 4: Fix the public re-export at the bottom of `sdk/web/src/index.ts`**

`index.ts` has a second, separate reference to the old path — a public type re-export near the
end of the file (currently line 510, may have shifted slightly after Step 3's edit):

```typescript
export type { DomDigest, DigestElement } from "./digest.js";
```

Change it to:

```typescript
export type { DomDigest, DigestElement } from "@skilly/browser-core";
```

This is easy to miss because it's far from the internal import block edited in Step 3 and is
part of `sdk/web`'s own public API surface (consumers do
`import type { DomDigest } from "@skilly/web"`), not an internal implementation detail — grep
the whole file for `from "./digest.js"`, `from "./pointing.js"`, `from "./actions.js"`, `from
"./prompt.js"`, `from "./realtime.js"`, `from "./core.js"` before moving on, to confirm no other
reference to the six moved files' old paths survives anywhere in `sdk/web/src/index.ts`:

```bash
grep -n 'from "\./\(digest\|pointing\|actions\|prompt\|realtime\|core\)\.js"' sdk/web/src/index.ts
```

Expected: no output (empty match) once Steps 3 and 4 are both done.

- [ ] **Step 5: Update the `CursorHost` import in `sdk/web/src/widget.ts`**

Change the import added in Task 2 Step 4 from:

```typescript
import type { CursorHost } from "./pointing.js";
```

to:

```typescript
import type { CursorHost } from "@skilly/browser-core";
```

- [ ] **Step 6: Run the full `sdk/web` verification suite**

Run: `cd sdk/web && bun test && bun run typecheck && bun run build`
Expected: identical results to before this entire plan started — same pass count (26 pass, 0
fail — `token.test.ts` plus the three moved-and-back-via-import files' worth of behavior, now
exercised through `@skilly/browser-core` rather than sibling files), `tsc --noEmit` clean,
`tsup` produces the same three build artifacts (`skilly-web.js`, `skilly-web.global.js`,
`index.d.ts`) with no unexpected size change (a few KB of variance from module resolution
overhead is fine; a large jump would mean something didn't tree-shake correctly).

- [ ] **Step 7: Manual smoke test**

Run: `cd sdk/web && bun run demo`, open `http://localhost:4321`, click the launcher, and confirm
the simulated turn lifecycle (listening → thinking → speaking → pointing) still animates exactly
as before. This is the one check no automated suite covers — the demo page requires no backend.

- [ ] **Step 8: Commit**

```bash
git add sdk/web/package.json sdk/web/bun.lock sdk/web/src/index.ts sdk/web/src/widget.ts
git commit -m "Wire @skilly/web to consume @skilly/browser-core"
```

---

### Task 5: Update repo documentation

**Files:**
- Modify: `/Users/engmsaleh/Repos/skilly/CLAUDE.md` (the `@skilly/web` embed widget file table,
  and the Key Files self-update convention this repo documents for itself)

**Interfaces:** None — documentation only.

- [ ] **Step 1: Add `sdk/browser-core` to CLAUDE.md**

In the `### @skilly/web embed widget (sdk/web)` section of `CLAUDE.md`, add a new row to that
section's file table (immediately before the `sdk/web/src/index.ts` row, since it's now imported
by it) noting the new package. Add a one-line sentence to the section's introductory paragraph:
"Browser-generic logic (digest, pointing, actions, prompt composition, realtime, wasm core
loader) lives in the sibling `sdk/browser-core` package, shared with the Skilly browser
extension — see `sdk/browser-core/README.md`." Also remove `sdk/web/src/digest.ts`,
`pointing.ts`, `actions.ts`, `prompt.ts`, `realtime.ts`, `core.ts` from that table's individual
rows if they are listed there (check the current table content before editing — add/remove rows
to match the file's real current location, per this file's own stated self-update convention:
"New files: Add new source files... Deleted files: Remove entries for files that no longer
exist").

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Document sdk/browser-core in CLAUDE.md"
```
