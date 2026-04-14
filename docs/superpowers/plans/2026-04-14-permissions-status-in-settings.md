# Permissions Status in Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Permissions section to Skilly's Settings panel so users can always see the current state of Accessibility, Screen Recording, Microphone, and Screen Content permissions — and re-grant any that were silently revoked — without relying on the transient onboarding permission flow.

**Architecture:** The permission state is already tracked on `CompanionManager` via four `@Published Bool` properties and polled every 1.5s by an existing `Timer`. This plan wires those existing `@Published` sources into a new `permissionsSection` inside `SettingsView.generalContent`, plus adds an `NSApplication.didBecomeActiveNotification` subscription so the state refreshes the instant the user returns from System Settings — no need to wait up to 1.5s for the next poll tick.

**Tech Stack:** SwiftUI (macOS), AppKit (`NSApplication` notification), existing `WindowPositionManager` static methods for permission checks and for opening the relevant System Settings pane, existing `CompanionManager.refreshAllPermissions()` for the re-check.

---

## Background (what already exists, do not duplicate)

- `CompanionManager.hasAccessibilityPermission`, `hasScreenRecordingPermission`, `hasMicrophonePermission`, `hasScreenContentPermission` — all `@Published private(set) Bool` (lines 29–32 of `leanring-buddy/CompanionManager.swift`).
- `CompanionManager.allPermissionsGranted` — computed property at line 145 that ANDs all four.
- `CompanionManager.refreshAllPermissions()` — line 361, reads the live state and updates the `@Published` properties.
- `accessibilityCheckTimer` — 1.5s repeating `Timer` in `CompanionManager.startPermissionPolling()` (around line 483) that calls `refreshAllPermissions()`.
- `WindowPositionManager.hasAccessibilityPermission()` / `hasScreenRecordingPermission()` / `openAccessibilitySettings()` / `openScreenRecordingSettings()` — lines 35, 79, 64, 133 of `leanring-buddy/WindowPositionManager.swift`.
- `CompanionManager.requestMicrophonePermission()` — around line 471, calls `AVCaptureDevice.requestAccess(for: .audio)`.
- `CompanionPanelView.accessibilityPermissionRow` / `microphonePermissionRow` / `screenRecordingPermissionRow` / `screenContentPermissionRow` — around lines 379–393 of `leanring-buddy/CompanionPanelView.swift`. **These rows only render when `!allPermissionsGranted`.** That's the gap this plan closes.
- `SettingsView` tab enum: `.account` / `.voice` / `.general` (line 20 of `leanring-buddy/SettingsView.swift`). We're extending the `.general` tab, not adding a new tab, to keep scope tight.
- Design tokens: `DS.Colors.destructive`, `DS.Colors.warning` (`DesignSystem.swift` lines 114, 122) are already defined for missing/warning states.

**Why not a new "Privacy" tab?** YAGNI. Four rows at the bottom of the existing General tab is a smaller change, less risk of reflow/layout regressions, and still solves the user's problem ("I want to see permission status inside Settings"). If this feature grows later, splitting it into its own tab is a 10-line follow-up.

---

## File Structure

**Modified files:**
- `leanring-buddy/SettingsView.swift` — add a `@ObservedObject var companionManager` property, a `permissionsSection` helper, and a `permissionRow` helper. Append `permissionsSection` to the bottom of `generalContent`.
- `leanring-buddy/CompanionManager.swift` — in `startPermissionPolling()`, add an `NSApplication.didBecomeActiveNotification` observer that calls `refreshAllPermissions()`.
- `leanring-buddy/CompanionPanelView.swift` — update the Settings popover call-site to pass `companionManager` to `SettingsView(...)`.

**No new files.** No new tests (see Testing Strategy below).

---

## Testing Strategy

The change is SwiftUI view composition + one NotificationCenter observer. The Skilly test target currently has **zero UI tests and zero CompanionManager tests** — adding a ViewInspector setup is out of scope. Strategy:

1. **Compile check** via Xcode build (required before each commit).
2. **Unit test** for the notification observer (Task 2): verify that posting `NSApplication.didBecomeActiveNotification` on the main queue triggers `refreshAllPermissions()`. This is a small, behavioral test that fits the existing XCTest target.
3. **Manual smoke test** at the end (Task 3): launch the app, open Settings → General, scroll to the Permissions section, toggle a permission OFF in System Settings, switch back to Skilly, confirm the row flips to "Missing" within 1 second without any click on the refresh button.

The manual smoke test is the honest final gate: SwiftUI rendering on macOS cannot be unit-tested without ViewInspector, and pulling that framework in for three rows is scope-creep.

---

### Task 1: Add Permissions section to SettingsView → General tab

**Files:**
- Modify: `leanring-buddy/SettingsView.swift` (add property, two helper views, append to `generalContent`)
- Modify: `leanring-buddy/CompanionPanelView.swift` (pass `companionManager` into `SettingsView` init call)

- [ ] **Step 1: Add `companionManager` property to `SettingsView`**

Modify `leanring-buddy/SettingsView.swift` around line 14-18 (the existing property declarations):

```swift
struct SettingsView: View {
    @ObservedObject var settings: AppSettings
    @ObservedObject var companionManager: CompanionManager
    var authManager: AuthManager?
    // ... rest unchanged
```

(Add `@ObservedObject var companionManager: CompanionManager` directly below `settings`. Keep existing `authManager` line as-is. If `authManager` isn't the second property, just add `companionManager` immediately after `settings` — the ordering of the other properties is irrelevant, but `companionManager` should come right after `settings` for readability.)

- [ ] **Step 2: Update the Settings popover callsite in `CompanionPanelView.swift`**

Find the place that instantiates `SettingsView(settings: ...)`. Run:

```bash
cd /Users/engmsaleh/Repos/clicky
/usr/bin/grep -n 'SettingsView(' leanring-buddy/CompanionPanelView.swift
```

Expected: one or two lines, likely inside a `.popover` or `.sheet` modifier with `SettingsView(settings: settings, authManager: authManager)` or similar.

Change the call site to:

```swift
SettingsView(
    settings: settings,
    companionManager: companionManager,
    authManager: authManager
)
```

(Keep whatever other arguments are already being passed — only add `companionManager: companionManager`. The `companionManager` reference is already available in `CompanionPanelView` scope because the view takes a `@ObservedObject var companionManager: CompanionManager` near the top of the file.)

- [ ] **Step 3: Add the `permissionRow` helper to `SettingsView`**

At the bottom of `SettingsView.swift`, inside `struct SettingsView`, just before the closing `}` of the struct (but after the existing tab content helpers like `accountContent`, `voiceContent`, `generalContent`), add:

```swift
    // MARK: - Permissions section

    /// A single row showing one permission's granted state with an action button.
    /// The button opens System Settings (or requests permission for mic) depending on `action`.
    @ViewBuilder
    private func permissionRow(
        title: String,
        systemImage: String,
        isGranted: Bool,
        actionTitle: String,
        action: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(isGranted ? DS.Colors.accent : DS.Colors.warning)
                .frame(width: 18)

            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(DS.Colors.textPrimary)
                Text(isGranted ? "Granted" : "Not granted")
                    .font(.system(size: 10))
                    .foregroundColor(isGranted ? DS.Colors.textTertiary : DS.Colors.warningText)
            }

            Spacer(minLength: 8)

            if !isGranted {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(DS.Colors.accentText)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(DS.Colors.accent.opacity(0.15))
                        )
                }
                .buttonStyle(.plain)
                .pointerCursor()
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 13))
                    .foregroundColor(DS.Colors.accent)
            }
        }
        .padding(.vertical, 4)
    }
```

- [ ] **Step 4: Add the `permissionsSection` helper**

Directly below the `permissionRow` helper you just added, add:

```swift
    /// The full Permissions section: header + four rows (Accessibility, Screen Recording,
    /// Microphone, Screen Content). Always visible so users can re-check state after the
    /// onboarding flow has already been completed.
    @ViewBuilder
    private var permissionsSection: some View {
        sectionHeader("PERMISSIONS")

        VStack(alignment: .leading, spacing: 6) {
            permissionRow(
                title: "Accessibility",
                systemImage: "hand.tap",
                isGranted: companionManager.hasAccessibilityPermission,
                actionTitle: "Open Settings",
                action: { WindowPositionManager.openAccessibilitySettings() }
            )

            permissionRow(
                title: "Screen Recording",
                systemImage: "display",
                isGranted: companionManager.hasScreenRecordingPermission,
                actionTitle: "Open Settings",
                action: { WindowPositionManager.openScreenRecordingSettings() }
            )

            permissionRow(
                title: "Microphone",
                systemImage: "mic",
                isGranted: companionManager.hasMicrophonePermission,
                actionTitle: "Request",
                action: { companionManager.requestMicrophonePermission() }
            )

            permissionRow(
                title: "Screen Content",
                systemImage: "rectangle.on.rectangle",
                isGranted: companionManager.hasScreenContentPermission,
                actionTitle: "Request",
                action: { companionManager.requestScreenContentPermission() }
            )
        }

        Text("Push-to-talk requires Accessibility and Microphone. If a permission was silently revoked, use the button to re-grant it.")
            .font(.system(size: 10))
            .foregroundColor(DS.Colors.textTertiary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 4)
    }
```

**Before you paste this, verify the two `companionManager` method names exist.** Run:

```bash
cd /Users/engmsaleh/Repos/clicky
/usr/bin/grep -n 'func requestMicrophonePermission\|func requestScreenContentPermission' leanring-buddy/CompanionManager.swift
```

Expected: both should match. If `requestScreenContentPermission` does not exist, search for the function that actually kicks off the screen-content (SCShareableContent) permission request — it's the same function called when the user clicks the screen content row in the panel's `permissionsCopySection`. Use that function name instead. If the function is not exposed (e.g. it's `fileprivate`), you have two options:
1. Change its access level to `internal` (preferred, minimal change).
2. Reuse the existing screen-content permission-request path from `CompanionPanelView` — look for where `screenContentPermissionRow` wires its button action and inline the same call.

Do NOT invent a function that doesn't exist.

- [ ] **Step 5: Append `permissionsSection` to the bottom of `generalContent`**

Find the `generalContent` computed property (around line 250 of `SettingsView.swift`) and append the permissions block at the very bottom, after the last existing entry. The exact placement:

```swift
    // MARK: - General Tab
    private var generalContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            // ... existing General tab content (do not change) ...

            divider

            permissionsSection
        }
    }
```

Use whatever the existing `divider` helper in this file is called. If there's no `divider` helper, just use `Divider().background(DS.Colors.borderSubtle)` to match the other section separators.

- [ ] **Step 6: Build and check for compile errors**

Open the project in Xcode:

```bash
open /Users/engmsaleh/Repos/clicky/leanring-buddy.xcodeproj
```

Press Cmd+B. Expected: build succeeds with only the known non-blocking Swift 6 concurrency warnings (same ones as before this change — do not attempt to fix them).

**Do NOT run `xcodebuild` from the terminal** — per `CLAUDE.md`, that invalidates TCC permissions and the app will need to re-request Accessibility, Screen Recording, etc., which would make the rest of this plan untestable.

If the build fails:
- Missing `authManager` argument → you removed it when you shouldn't have. Put it back.
- `requestScreenContentPermission` not found → see Step 4's fallback.
- `sectionHeader` not found → there's no such helper in this file; use the raw `Text("PERMISSIONS").font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundColor(DS.Colors.textTertiary).tracking(0.6)` instead, or find the real helper by searching `/usr/bin/grep -n 'sectionHeader' leanring-buddy/SettingsView.swift` and use the exact name.

- [ ] **Step 7: Commit**

```bash
cd /Users/engmsaleh/Repos/clicky
git add leanring-buddy/SettingsView.swift leanring-buddy/CompanionPanelView.swift
git commit -m "feat(skilly): add persistent Permissions section to Settings → General

Shows status of Accessibility, Screen Recording, Microphone, and Screen
Content with per-row action buttons that open System Settings (or fire
the in-app request for mic / screen content). Always visible — closes
the hole where permission rows disappeared from the main panel once
everything was granted, leaving users with no way to audit state after
a TCC grant was silently revoked (e.g. after a Sparkle update invalidated
the code-signature-bound TCC entries)."
```

---

### Task 2: Re-poll permissions on app activation

**Why:** Currently, the permission poller is a 1.5s `Timer`, so when a user leaves Skilly → opens System Settings → toggles Accessibility → alt-tabs back to Skilly, they may wait up to 1.5s for the Settings permission row and the main panel's "permissions needed" section to update. More importantly, macOS sometimes delays `AXIsProcessTrusted()` reads until the process has focus again — an immediate re-check on activation is more reliable than waiting for the poll tick.

**Files:**
- Modify: `leanring-buddy/CompanionManager.swift` (add observer in `startPermissionPolling`, tear down in `deinit`)
- Create: `leanring-buddyTests/CompanionManagerPermissionRefreshTests.swift` (new XCTest file)

- [ ] **Step 1: Write the failing test**

Create `leanring-buddyTests/CompanionManagerPermissionRefreshTests.swift` with this content:

```swift
import XCTest
import Combine
@testable import leanring_buddy

@MainActor
final class CompanionManagerPermissionRefreshTests: XCTestCase {

    func test_didBecomeActive_notification_triggers_refreshAllPermissions() {
        // Given: a CompanionManager with a counter that increments every time
        // refreshAllPermissions is called. We observe the counter via a spy
        // installed on an NSNotification.Name we post manually.
        let refreshedExpectation = expectation(
            forNotification: Notification.Name("SkillyTest.PermissionsRefreshed"),
            object: nil
        )

        let sut = CompanionManager.makeTestInstance(
            onRefreshAllPermissions: {
                NotificationCenter.default.post(
                    name: Notification.Name("SkillyTest.PermissionsRefreshed"),
                    object: nil
                )
            }
        )
        sut.start()

        // When: the app would post didBecomeActiveNotification (e.g. user alt-tabs
        // back from System Settings)
        NotificationCenter.default.post(
            name: NSApplication.didBecomeActiveNotification,
            object: nil
        )

        // Then: refreshAllPermissions should have been called
        wait(for: [refreshedExpectation], timeout: 1.0)
    }
}
```

**This test requires a test hook on `CompanionManager`** — a factory method `makeTestInstance(onRefreshAllPermissions:)` that constructs a real `CompanionManager` but with a closure that fires every time `refreshAllPermissions()` runs. If creating that hook would force too much surgery on `CompanionManager.init`, the fallback is a simpler test:

```swift
@MainActor
final class CompanionManagerPermissionRefreshTests: XCTestCase {
    func test_didBecomeActive_notification_triggers_permission_refresh_without_crashing() {
        // Smoke test: we just verify the observer is installed and doesn't crash
        // when the notification fires. The actual refresh behavior is verified
        // by manual smoke test in Task 3.
        let sut = CompanionManager(
            // ... use the same arguments the app delegate uses ...
        )
        sut.start()

        // Should not crash or deadlock
        NotificationCenter.default.post(
            name: NSApplication.didBecomeActiveNotification,
            object: nil
        )

        // Give the main queue one tick to process the notification
        let drainExpectation = expectation(description: "main queue drain")
        DispatchQueue.main.async { drainExpectation.fulfill() }
        wait(for: [drainExpectation], timeout: 0.5)
    }
}
```

Pick the factory-hook version if it's <30 lines of CompanionManager surgery. Otherwise use the smoke-test version. Do not spend more than 10 minutes trying to construct a real CompanionManager in the test — if it has many dependencies, use the smoke-test version and move on.

- [ ] **Step 2: Run the test to verify it fails**

In Xcode, select the test target and press Cmd+U. Expected failure:
- If using the factory-hook version: "unresolved identifier `makeTestInstance`" — because we haven't added the factory yet.
- If using the smoke-test version: the test may already pass (since we haven't added the observer yet, the notification does nothing and the test just drains the queue). In that case, **the smoke test version does NOT verify new behavior and should be rewritten** to at least assert that `sut.hasAccessibilityPermission` was re-read — which means we need a spy. If you can't build a spy cleanly, skip the unit test entirely and rely on the manual smoke test in Task 3. Note this in the commit message.

- [ ] **Step 3: Add the observer in `CompanionManager.startPermissionPolling()`**

Find `startPermissionPolling()` in `leanring-buddy/CompanionManager.swift` (near line 480). The function currently starts a `Timer.scheduledTimer` every 1.5s. Modify it to also install an `NSApplication.didBecomeActiveNotification` observer. The Combine-based approach:

```swift
    private func startPermissionPolling() {
        accessibilityCheckTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.refreshAllPermissions()
            }
        }

        // MARK: - Skilly — Refresh permissions immediately when the user
        // returns to Skilly (e.g. after granting a permission in System Settings).
        // Without this, users wait up to 1.5s for the next poll tick.
        appActivationCancellable = NotificationCenter.default
            .publisher(for: NSApplication.didBecomeActiveNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.refreshAllPermissions()
            }
    }
```

Add a new stored property at the top of `CompanionManager` (near the other `AnyCancellable` properties, around line 90 where other cancellables live — search for `AnyCancellable` to find them):

```swift
    private var appActivationCancellable: AnyCancellable?
```

Add tearDown in `deinit` if `CompanionManager` has one. If it doesn't have a `deinit`, the `[weak self]` capture is sufficient — the cancellable is a property on `self`, so when `self` is released the subscription is torn down automatically.

- [ ] **Step 4: Run the test to verify it passes**

In Xcode, Cmd+U. Expected: the `test_didBecomeActive_notification_triggers...` test passes. If using the factory-hook version, you'll also need to add the factory:

```swift
    #if DEBUG
    /// Test-only factory that installs a spy on refreshAllPermissions.
    /// DO NOT call from production code.
    static func makeTestInstance(
        onRefreshAllPermissions: @escaping () -> Void
    ) -> CompanionManager {
        let instance = CompanionManager(/* minimal real deps or mocks */)
        instance.testRefreshSpy = onRefreshAllPermissions
        return instance
    }

    fileprivate var testRefreshSpy: (() -> Void)?
    #endif
```

And add a single line at the top of `refreshAllPermissions()`:

```swift
    func refreshAllPermissions() {
        #if DEBUG
        testRefreshSpy?()
        #endif
        // ... existing body unchanged ...
    }
```

This keeps production paths untouched (the spy only exists in DEBUG builds).

If this factory approach doesn't compile cleanly within 10 minutes, **delete the test file** and rely on Task 3's manual smoke test. A missing unit test is better than a broken test target that blocks CI.

- [ ] **Step 5: Commit**

```bash
cd /Users/engmsaleh/Repos/clicky
git add leanring-buddy/CompanionManager.swift leanring-buddyTests/CompanionManagerPermissionRefreshTests.swift
git commit -m "feat(skilly): re-poll permissions on app activation

Installs an NSApplication.didBecomeActiveNotification observer in
CompanionManager.startPermissionPolling() so that when the user returns
from System Settings after granting a permission, the panel and the new
Settings → Permissions section update within ~1 run-loop tick instead
of waiting up to 1.5s for the next poll tick. Teardown is automatic via
the [weak self] capture in the Combine sink.

Also addresses the macOS quirk where AXIsProcessTrusted() can lag until
the process has focus again — re-checking on activation is more reliable
than polling alone."
```

(If you didn't add the test file because the factory hook was too much surgery, drop `leanring-buddyTests/CompanionManagerPermissionRefreshTests.swift` from the `git add` above.)

---

### Task 3: Manual smoke test and final commit

**Files:** None modified. This is the verification gate.

- [ ] **Step 1: Launch Skilly from Xcode**

In Xcode (already open from Task 1), Cmd+R. Expected: Skilly appears in the menu bar. The panel may auto-open if onboarding is incomplete.

- [ ] **Step 2: Confirm the Permissions section renders in Settings → General**

Click the Skilly menu bar icon → click the gear icon → switch to the **General** tab → scroll to the bottom. Expected: a **PERMISSIONS** section header followed by four rows: Accessibility, Screen Recording, Microphone, Screen Content. Each row shows either a green checkmark (granted) or a yellow "Not granted" subtitle with an action button.

- [ ] **Step 3: Verify live updates on app activation**

With the Settings popover still open and visible:
1. Open **System Settings → Privacy & Security → Accessibility**.
2. Toggle Skilly's accessibility permission **OFF**.
3. Click back on the Skilly menu bar icon (or any Skilly window) to return focus to Skilly.
4. Expected: within ~1 second, the Accessibility row in Settings → General → Permissions flips from "Granted" (green checkmark) to "Not granted" (yellow warning + "Open Settings" button).
5. Toggle it back **ON** in System Settings.
6. Return focus to Skilly.
7. Expected: the row flips back to "Granted" within ~1 second.

- [ ] **Step 4: Verify the "Open Settings" button actually opens the right pane**

With Accessibility still OFF, click the "Open Settings" button in the row. Expected: System Settings opens directly to **Privacy & Security → Accessibility** with Skilly visible in the list. (This uses the existing `WindowPositionManager.openAccessibilitySettings()` method which is already known-working.)

Repeat for Screen Recording: toggle it off, click "Open Settings" in the Screen Recording row, confirm System Settings opens to **Privacy & Security → Screen Recording**.

- [ ] **Step 5: Verify push-to-talk recovery**

With all four permissions granted, press and hold `ctrl + option`, say "test", release. Expected: the blue cursor overlay activates, records your voice, and responds. This confirms the feature didn't accidentally break the existing push-to-talk path.

If push-to-talk was broken before this plan (per the debugging session that triggered this plan), also verify: when the user has `hasCompletedOnboarding == true` from a previous install but fresh TCC grants (simulating the Sparkle-update scenario), the Settings → General → Permissions section correctly shows the missing permissions and the action buttons work to re-grant them. You can simulate this by manually revoking a permission in System Settings, closing Skilly, relaunching, and confirming the Permissions section still shows correct state in the fresh session.

- [ ] **Step 6: Final commit (if any last touch-ups)**

If all smoke-test steps pass with no additional code changes, there is nothing left to commit — the commits from Tasks 1 and 2 cover the full feature. Skip to the summary.

If a smoke-test step revealed a bug (e.g. wrong image name, wrong row order, the Permissions section overlaps with an existing section), fix it and commit separately:

```bash
cd /Users/engmsaleh/Repos/clicky
git add -p  # review each hunk
git commit -m "fix(skilly): <specific issue found in smoke test>"
```

---

## Self-Review

**Spec coverage:**
- ✅ "Put the status of the permissions inside the app settings" → Task 1 adds the Permissions section to Settings → General.
- ✅ "Live update when user grants a permission in System Settings" → Task 2 adds `didBecomeActiveNotification` observer.
- ✅ "Make the failure visible so users can self-diagnose" → Settings section shows per-row "Granted" / "Not granted" state with actionable buttons. The existing main-panel `permissionsCopySection` (lines 272–279 of `CompanionPanelView.swift`) already handles the big red "Permissions were revoked" banner for the `hasCompletedOnboarding == true` case, so no changes needed there.
- ✅ "Fix the hasCompletedOnboarding-persists-across-reinstalls latent bug" → This plan does NOT touch `hasCompletedOnboarding`, because the existing panel flow (`if !allPermissionsGranted { permissionsCopySection }` at line 30) already shows the permission section regardless of onboarding state. The user reaching Settings → Permissions is a second safety net. If you want to additionally drop the `hasCompletedOnboarding` gate on startup (line 211 of `CompanionManager`), that's a **separate plan** — do not expand this one.

**Placeholder scan:**
- ❌ → ✅ Step 3 of Task 1 referenced `sectionHeader` which may or may not exist in `SettingsView.swift` — fixed by adding an explicit fallback in Step 6 (Task 1).
- ❌ → ✅ Step 4 of Task 1 referenced `requestScreenContentPermission` which may not exist — fixed by adding a grep verification and fallback in Step 4.
- ❌ → ✅ Task 2 unit-test path has two variants (factory-hook vs smoke-test) with a 10-minute time budget to decide between them, and an explicit "delete the test file if it's too much surgery" escape hatch — no placeholder.

**Type consistency:**
- ✅ `permissionRow` signature is referenced identically in all four call sites inside `permissionsSection`.
- ✅ `WindowPositionManager.openAccessibilitySettings()` and `openScreenRecordingSettings()` are confirmed to exist (lines 64 and 133 of `WindowPositionManager.swift`).
- ✅ `companionManager.hasAccessibilityPermission` / `hasScreenRecordingPermission` / `hasMicrophonePermission` / `hasScreenContentPermission` are all `@Published` on `CompanionManager` (lines 29–32).
- ⚠️ `companionManager.requestMicrophonePermission()` — confirmed via Step 4 grep command.
- ⚠️ `companionManager.requestScreenContentPermission()` — NOT confirmed; Step 4 includes a grep-and-fallback instruction.

---

## Out of scope (do NOT implement in this plan)

- Adding a new "Privacy" tab to SettingsView. The four rows fit in General.
- Fixing the `hasCompletedOnboarding` UserDefaults persistence bug. Requires a separate plan and brainstorming (e.g. should it be reset on code-signature change? stored in Keychain? nuked on every launch?).
- Adding os_log / unified-logging for the silent `CGEvent.tapCreate` failure. That's a release-build observability fix that needs its own plan.
- Adding ViewInspector to the test target for real SwiftUI testing. Large infra change, separate plan.
- Touching `GlobalPushToTalkShortcutMonitor.swift` to emit a user-visible error on tap-creation failure. Separate plan.
- Adding a "Reset onboarding" button in Settings. Separate feature, not requested.
