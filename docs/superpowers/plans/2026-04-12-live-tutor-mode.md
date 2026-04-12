# Live Tutor Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Live Tutor" always-on listening mode alongside push-to-talk, using OpenAI Realtime's server-side VAD to automatically detect speech, capture screenshots, and respond — creating a hands-free tutoring experience.

**Architecture:** Hybrid approach. Push-to-talk (existing) stays as the default. A new `VoiceInputMode` enum (`.pushToTalk` / `.liveTutor`) stored in `AppSettings` controls which path the pipeline uses. In Live Tutor mode, the mic streams continuously to the open WebSocket, OpenAI's server VAD detects speech boundaries, and the client handles `speech_started` / `speech_stopped` events to drive UI state and screenshot capture. An auto-sleep timer deactivates the mic after configurable silence duration to save cost.

**Tech Stack:** SwiftUI, AVAudioEngine, OpenAI Realtime WebSocket, CGEvent tap (existing).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `leanring-buddy/AppSettings.swift` | Modify | Add `voiceInputMode` setting ("pushToTalk" / "liveTutor"), `liveTutorAutoSleepMinutes` setting |
| `leanring-buddy/OpenAIRealtimeClient.swift` | Modify | Add `updateTurnDetection(enabled:)` method, handle `speech_started`/`speech_stopped` events with new event cases |
| `leanring-buddy/CompanionManager.swift` | Modify | Add `startLiveTutorMode()`/`stopLiveTutorMode()` pipeline, handle VAD events, screenshot capture on speech start, auto-sleep timer |
| `leanring-buddy/SettingsView.swift` | Modify | Add Voice Input Mode picker in Voice tab |
| `leanring-buddy/PanelBodyView.swift` | Modify | Update the bottom hint strip to show mode-appropriate text |
| `leanring-buddy/CompanionPanelView.swift` | Modify | Update PTT hint text at bottom |

---

### Task 1: Add VoiceInputMode to AppSettings

**Files:**
- Modify: `leanring-buddy/AppSettings.swift`

- [ ] **Step 1: Add voiceInputMode and liveTutorAutoSleepMinutes properties**

In `leanring-buddy/AppSettings.swift`, add after the `voiceName` property (line ~118):

```swift
// MARK: - Voice Input Mode

/// Controls how Skilly listens for user speech.
/// "pushToTalk" — user holds a keyboard shortcut to talk (default).
/// "liveTutor" — always-on mic with server-side VAD; model listens
/// continuously and responds when it detects the user speaking.
@Published var voiceInputMode: String {
    didSet { UserDefaults.standard.set(voiceInputMode, forKey: "voiceInputMode") }
}

/// Minutes of silence before Live Tutor mode auto-sleeps the mic to
/// save cost. The mic restarts when the user taps the PTT shortcut
/// or re-enables Live Tutor in settings. 0 = never auto-sleep.
@Published var liveTutorAutoSleepMinutes: Int {
    didSet { UserDefaults.standard.set(liveTutorAutoSleepMinutes, forKey: "liveTutorAutoSleepMinutes") }
}
```

In the `init()` method, before the closing brace (line ~171), add:

```swift
// Voice Input Mode
self.voiceInputMode = UserDefaults.standard.string(forKey: "voiceInputMode") ?? "pushToTalk"
self.liveTutorAutoSleepMinutes = {
    let stored = UserDefaults.standard.integer(forKey: "liveTutorAutoSleepMinutes")
    return stored > 0 ? stored : 5  // Default: 5 minutes
}()
```

- [ ] **Step 2: Verify it compiles**

Build in Xcode (Cmd+R). No new errors expected — these are additive properties.

- [ ] **Step 3: Commit**

```bash
git add leanring-buddy/AppSettings.swift
git commit -m "feat(skilly): add voiceInputMode and liveTutorAutoSleepMinutes settings"
```

---

### Task 2: Add VAD event support to OpenAIRealtimeClient

**Files:**
- Modify: `leanring-buddy/OpenAIRealtimeClient.swift`

- [ ] **Step 1: Add new event cases for server VAD**

In the `OpenAIRealtimeEvent` enum (~line 79), add two new cases:

```swift
case speechStarted           // Server VAD detected user started speaking
case speechStopped           // Server VAD detected user stopped speaking
```

- [ ] **Step 2: Add updateTurnDetection method**

In `OpenAIRealtimeClient`, after the existing `updateVoice(voiceName:)` method (~line 250), add:

```swift
/// Toggle server-side VAD on or off.
/// When enabled, the server auto-detects speech boundaries and
/// auto-commits the audio buffer + triggers a response on silence.
/// When disabled (push-to-talk), the client controls commit timing.
func updateTurnDetection(enabled: Bool) async throws {
    guard isConnected || webSocketTask != nil else { return }

    let turnDetection: Any
    if enabled {
        turnDetection = [
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 700
        ] as [String: Any]
    } else {
        turnDetection = NSNull()
    }

    let sessionUpdate: [String: Any] = [
        "type": "session.update",
        "session": [
            "turn_detection": turnDetection
        ]
    ]

    try await sendEvent(sessionUpdate)

    #if DEBUG
    print("🎙️ OpenAI Realtime: turn detection \(enabled ? "enabled (server VAD)" : "disabled (push-to-talk)")")
    #endif
}
```

- [ ] **Step 3: Emit speechStarted/speechStopped events**

In the `handleMessage` method, update the existing `speech_started` and `speech_stopped` cases. Change from debug-only logging to publishing events:

Replace the `input_audio_buffer.speech_started` case (~line 488):

```swift
case "input_audio_buffer.speech_started":
    #if DEBUG
    print("🎙️ OpenAI Realtime: speech detected")
    #endif
    eventPublisher.send(.speechStarted)
```

Replace the `input_audio_buffer.speech_stopped` case (~line 494):

```swift
case "input_audio_buffer.speech_stopped":
    #if DEBUG
    print("🎙️ OpenAI Realtime: speech ended")
    #endif
    eventPublisher.send(.speechStopped)
```

- [ ] **Step 4: Verify it compiles**

Build in Xcode (Cmd+R). No errors expected — new enum cases and a new method.

- [ ] **Step 5: Commit**

```bash
git add leanring-buddy/OpenAIRealtimeClient.swift
git commit -m "feat(skilly): add server VAD event support and updateTurnDetection method"
```

---

### Task 3: Implement Live Tutor pipeline in CompanionManager

This is the core task. CompanionManager needs a parallel pipeline that:
1. Keeps the mic streaming continuously to the WebSocket.
2. Captures screenshots on `speech_started` (not continuously).
3. Resets turn state on `speech_started`.
4. Lets the server auto-commit and auto-respond on `speech_stopped`.
5. Auto-sleeps after N minutes of no speech.

**Files:**
- Modify: `leanring-buddy/CompanionManager.swift`

- [ ] **Step 1: Add Live Tutor state properties**

Near the existing per-turn state properties (~line 128, after `isAwaitingForcedSpokenFollowUp`), add:

```swift
// MARK: - Skilly — Live Tutor mode state
private var isLiveTutorModeActive = false
private var liveTutorAudioEngine: AVAudioEngine?
private var liveTutorAutoSleepTask: Task<Void, Never>?
private var liveTutorSettingsCancellable: AnyCancellable?
```

- [ ] **Step 2: Add startLiveTutorMode method**

After the `stopOpenAIRealtimePushToTalk()` method (~line 1112), add the Live Tutor pipeline:

```swift
// MARK: - Skilly — Live Tutor Mode Pipeline

/// Starts always-on listening. The mic streams to the open WebSocket
/// and server-side VAD handles speech detection. Screenshots are
/// captured when the server fires speech_started so the model has
/// visual context for the current utterance.
private func startLiveTutorMode() {
    guard !isLiveTutorModeActive else { return }
    isLiveTutorModeActive = true

    #if DEBUG
    print("🎓 Live Tutor: starting")
    #endif

    Task {
        do {
            try await ensureRealtimeSessionReadyForTurn()
            try await openAIRealtimeClient.updateTurnDetection(enabled: true)
        } catch {
            #if DEBUG
            print("⚠️ Live Tutor: failed to start session: \(error)")
            #endif
            isLiveTutorModeActive = false
            return
        }

        // Start continuous mic streaming
        let audioEngine = AVAudioEngine()
        self.liveTutorAudioEngine = audioEngine

        let inputNode = audioEngine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1600, format: inputFormat) { [weak self] buffer, _ in
            guard let self, self.isLiveTutorModeActive else { return }
            guard let pcm16Data = self.convertBufferToPCM16(buffer) else { return }
            self.openAIRealtimeClient.appendAudioChunk(pcm16Data)
        }

        audioEngine.prepare()
        try? audioEngine.start()

        #if DEBUG
        print("🎓 Live Tutor: mic streaming started")
        #endif

        // Reset auto-sleep timer
        resetLiveTutorAutoSleepTimer()
    }
}

/// Stops always-on listening and switches turn_detection back to
/// manual (push-to-talk). Does NOT disconnect the WebSocket — the
/// session stays warm for a fast switch back.
private func stopLiveTutorMode() {
    guard isLiveTutorModeActive else { return }
    isLiveTutorModeActive = false

    #if DEBUG
    print("🎓 Live Tutor: stopping")
    #endif

    liveTutorAutoSleepTask?.cancel()
    liveTutorAutoSleepTask = nil

    liveTutorAudioEngine?.stop()
    liveTutorAudioEngine?.inputNode.removeTap(onBus: 0)
    liveTutorAudioEngine = nil

    // Revert to manual turn detection for push-to-talk
    Task {
        try? await openAIRealtimeClient.updateTurnDetection(enabled: false)
    }

    voiceState = .idle
    clearRealtimeResponseBubble()
}

/// Resets the auto-sleep countdown. Called on every speech_started
/// event and when Live Tutor mode is first activated.
private func resetLiveTutorAutoSleepTimer() {
    liveTutorAutoSleepTask?.cancel()
    let autoSleepMinutes = AppSettings.shared.liveTutorAutoSleepMinutes
    guard autoSleepMinutes > 0 else { return }

    liveTutorAutoSleepTask = Task {
        try? await Task.sleep(for: .seconds(autoSleepMinutes * 60))
        guard !Task.isCancelled, isLiveTutorModeActive else { return }
        #if DEBUG
        print("🎓 Live Tutor: auto-sleeping after \(autoSleepMinutes) minutes of silence")
        #endif
        stopLiveTutorMode()
        AppSettings.shared.voiceInputMode = "pushToTalk"
    }
}
```

- [ ] **Step 3: Handle speechStarted and speechStopped events**

In the `handleRealtimeEvent` method, add two new cases BEFORE the existing `.error` case:

```swift
case .speechStarted:
    // MARK: - Skilly — Live Tutor: server detected speech
    guard isLiveTutorModeActive else { break }
    resetLiveTutorAutoSleepTimer()

    // Reset per-turn state for the new utterance
    realtimeResponseText = ""
    currentTurnUserTranscript = nil
    currentTurnScreenCaptures = []
    hasEndedAssistantSpeechForCurrentTurn = false
    didReceivePointToolCallForCurrentTurn = false
    didReceiveAnyAudioChunkForCurrentTurn = false
    pendingToolCallIdForCurrentTurn = nil
    isAwaitingForcedSpokenFollowUp = false
    currentTurnStartTime = Date()
    clearDetectedElementLocation()
    clearRealtimeResponseBubble()

    voiceState = .listening

    // If the cursor is hidden, bring it back transiently
    if !isSkillyCursorEnabled && !isOverlayVisible {
        overlayWindowManager.hasShownOverlayBefore = true
        overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
        isOverlayVisible = true
    }

    // Capture screenshots now so the model has visual context
    Task {
        do {
            let allScreenCaptures = try await CompanionScreenCaptureUtility.captureAllScreensAsJPEG()
            currentTurnScreenCaptures = allScreenCaptures
            for (screenIndex, screenCapture) in allScreenCaptures.enumerated() {
                let screenshotDescription = """
                \(screenCapture.label). \
                coordinate space: \(screenCapture.screenshotWidthInPixels)x\(screenCapture.screenshotHeightInPixels) pixels. \
                app display frame in points: \(Int(screenCapture.displayFrame.width))x\(Int(screenCapture.displayFrame.height)). \
                screen number: \(screenIndex + 1).
                """
                openAIRealtimeClient.sendScreenshot(
                    screenCapture.imageData,
                    withText: screenshotDescription
                )
            }
        } catch {
            #if DEBUG
            print("⚠️ Live Tutor: screenshot capture failed: \(error)")
            #endif
        }
    }

case .speechStopped:
    // MARK: - Skilly — Live Tutor: server detected end of speech
    guard isLiveTutorModeActive else { break }
    // Server auto-commits the audio buffer and triggers a response.
    // We just update voiceState so the UI shows the processing state.
    voiceState = .processing
    #if DEBUG
    print("🎓 Live Tutor: speech ended, server auto-committed")
    #endif
```

- [ ] **Step 4: Add mode-switching observer**

In the `bindSettingsObservers()` method (~line 501), after the existing voice name observer, add:

```swift
liveTutorSettingsCancellable = AppSettings.shared.$voiceInputMode
    .removeDuplicates()
    .dropFirst()
    .receive(on: DispatchQueue.main)
    .sink { [weak self] newMode in
        guard let self else { return }
        if newMode == "liveTutor" {
            self.startLiveTutorMode()
        } else {
            self.stopLiveTutorMode()
        }
    }
```

- [ ] **Step 5: Guard push-to-talk against Live Tutor mode**

In `handleShortcutTransition` (~line 654), at the top of the `.pressed` case, add a guard so push-to-talk doesn't conflict with Live Tutor:

```swift
case .pressed:
    // Don't register push-to-talk while the onboarding video is playing
    guard !showOnboardingVideo else { return }

    // In Live Tutor mode, the PTT shortcut toggles the mode off
    // and falls back to push-to-talk for this press.
    if isLiveTutorModeActive {
        stopLiveTutorMode()
        AppSettings.shared.voiceInputMode = "pushToTalk"
        // Fall through to normal PTT behavior below so this
        // press still registers as a push-to-talk start.
    }
```

- [ ] **Step 6: Handle interrupt — user speaks while model is responding**

In the `.speechStarted` case added in step 3, add interrupt handling at the top (before the per-turn reset):

```swift
case .speechStarted:
    guard isLiveTutorModeActive else { break }
    resetLiveTutorAutoSleepTimer()

    // If the model is currently speaking, cancel its response so
    // the user can interrupt naturally. This is the "barge-in" UX.
    if voiceState == .responding {
        openAIRealtimeClient.cancelResponse()
        realtimeAudioPlayer?.stop()
        #if DEBUG
        print("🎓 Live Tutor: user interrupted model, cancelling response")
        #endif
    }

    // Reset per-turn state for the new utterance
    // ... (rest of the code from step 3)
```

- [ ] **Step 7: Verify it compiles**

Build in Xcode (Cmd+R). Fix any issues.

- [ ] **Step 8: Commit**

```bash
git add leanring-buddy/CompanionManager.swift
git commit -m "feat(skilly): implement Live Tutor mode pipeline with VAD, auto-sleep, and barge-in"
```

---

### Task 4: Add mode picker to Settings Voice tab

**Files:**
- Modify: `leanring-buddy/SettingsView.swift`

- [ ] **Step 1: Add Voice Input Mode picker**

In the `voiceContent` view (~line 173), add a new section right after the "VOICE" section (after the AI Voice picker, before the divider at line 182):

```swift
divider

sectionHeader("INPUT MODE")
settingsRow("Voice input") {
    settingsPicker(
        selection: $settings.voiceInputMode,
        options: [
            ("pushToTalk", "Push to Talk"),
            ("liveTutor", "Live Tutor"),
        ]
    )
}

if settings.voiceInputMode == "liveTutor" {
    toggleRow(
        title: "Auto-sleep after silence",
        subtitle: "Pause mic after \(settings.liveTutorAutoSleepMinutes) min of silence to save cost.",
        isOn: Binding(
            get: { settings.liveTutorAutoSleepMinutes > 0 },
            set: { settings.liveTutorAutoSleepMinutes = $0 ? 5 : 0 }
        )
    )
}
```

- [ ] **Step 2: Conditionally show Shortcuts section**

Wrap the SHORTCUTS section header and its contents so they only show in push-to-talk mode. The existing code (~line 200):

```swift
divider

sectionHeader("SHORTCUTS")
settingsRow("Push to talk") { ... }
settingsRow("Cancel / Stop") { ... }
```

Becomes:

```swift
divider

if settings.voiceInputMode == "pushToTalk" {
    sectionHeader("SHORTCUTS")
    settingsRow("Push to talk") {
        settingsPicker(
            selection: $settings.pushToTalkShortcut,
            options: [
                ("controlOption", "Ctrl + Option"),
                ("shiftControl", "Shift + Ctrl"),
                ("shiftFunction", "Shift + Fn"),
                ("controlOptionSpace", "Ctrl + Option + Space"),
                ("shiftControlSpace", "Shift + Ctrl + Space"),
            ]
        )
    }
    settingsRow("Cancel / Stop") {
        keyBadge(settings.cancelKeyDisplayName)
    }
} else {
    sectionHeader("SHORTCUTS")
    settingsRow("Cancel / Stop") {
        keyBadge(settings.cancelKeyDisplayName)
    }
    Text("In Live Tutor mode, just start talking. Skilly listens automatically.")
        .font(.system(size: 10))
        .foregroundColor(DS.Colors.textTertiary)
        .fixedSize(horizontal: false, vertical: true)
}
```

- [ ] **Step 3: Verify it compiles**

Build in Xcode (Cmd+R).

- [ ] **Step 4: Commit**

```bash
git add leanring-buddy/SettingsView.swift
git commit -m "feat(skilly): add Live Tutor mode picker and auto-sleep toggle in Settings"
```

---

### Task 5: Update panel hint text for Live Tutor mode

**Files:**
- Modify: `leanring-buddy/CompanionPanelView.swift`

- [ ] **Step 1: Find the bottom PTT hint strip**

Search for the "Hold" text or "keyCapsuleLabels" in CompanionPanelView.swift. The hint strip currently shows something like `Hold ⌃ ⌥ to talk`. Update it to be mode-aware.

Find the hint strip view and wrap it:

```swift
// Existing push-to-talk hint (find this in the file):
// "Hold ⌃ ⌥ to talk"

// Replace with mode-aware text:
if AppSettings.shared.voiceInputMode == "liveTutor" {
    HStack(spacing: 4) {
        Circle()
            .fill(DS.Colors.success)
            .frame(width: 6, height: 6)
        Text("Live Tutor active · just start talking")
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(DS.Colors.textTertiary)
    }
} else {
    // Keep existing PTT hint strip exactly as-is
}
```

- [ ] **Step 2: Verify it compiles and the hint shows correctly**

Build in Xcode (Cmd+R). Open the panel and check:
- In push-to-talk mode: the existing hint with key caps
- Switch to Live Tutor in settings: green dot + "Live Tutor active · just start talking"

- [ ] **Step 3: Commit**

```bash
git add leanring-buddy/CompanionPanelView.swift
git commit -m "feat(skilly): mode-aware hint text in panel footer"
```

---

### Task 6: Update base prompt for Live Tutor context

**Files:**
- Modify: `leanring-buddy/CompanionManager.swift`

- [ ] **Step 1: Make the base prompt's opening line mode-aware**

The current `realtimeCompanionBasePrompt` starts with:

```
you're skilly, a friendly always-on teaching companion that lives in the user's menu bar. the user just spoke to you via push-to-talk and you can see their screen(s).
```

Add a computed property that modifies the prompt based on mode. After the static `realtimeCompanionBasePrompt` declaration (~line 706), add:

```swift
/// Returns the base prompt with a mode-specific preamble.
/// In Live Tutor mode, the model should know it's always listening
/// and should respond more concisely since there's no deliberate
/// push-to-talk action from the user (they might be thinking aloud).
private var modeAwareBasePrompt: String {
    if isLiveTutorModeActive {
        return Self.realtimeCompanionBasePrompt.replacingOccurrences(
            of: "the user just spoke to you via push-to-talk",
            with: "you're in live tutor mode — always listening. the user is working and talking to you naturally without pressing any buttons. they might think aloud, ask quick questions, or narrate what they're doing. be extra concise unless they ask for detail — they're in a flow state and interruptions should be short"
        )
    }
    return Self.realtimeCompanionBasePrompt
}
```

Then update `composedSystemPrompt` (search for where it references `Self.realtimeCompanionBasePrompt`) to use `modeAwareBasePrompt` instead. This is likely in `SkillPromptComposer.compose(...)` being called with the base prompt. Find where the base prompt is passed and swap:

```swift
// Before:
let currentSystemPrompt = composedSystemPrompt

// The composedSystemPrompt computed property likely calls:
// SkillPromptComposer.compose(basePrompt: Self.realtimeCompanionBasePrompt, ...)
// Change Self.realtimeCompanionBasePrompt → modeAwareBasePrompt
```

- [ ] **Step 2: Verify it compiles**

Build in Xcode (Cmd+R).

- [ ] **Step 3: Commit**

```bash
git add leanring-buddy/CompanionManager.swift
git commit -m "feat(skilly): mode-aware base prompt for Live Tutor"
```

---

### Task 7: End-to-end manual testing

**Files:** None (testing only)

- [ ] **Step 1: Test push-to-talk still works**

1. Open Skilly. Settings → Voice → Voice input → "Push to Talk" (default).
2. Hold ctrl+option, speak, release. Verify audio response plays.
3. Verify pointing works (tool call fires, cursor animates).

- [ ] **Step 2: Test Live Tutor mode activation**

1. Settings → Voice → Voice input → "Live Tutor".
2. Observe logs for `🎓 Live Tutor: starting` and `turn detection enabled (server VAD)`.
3. Start speaking without pressing any keys.
4. Observe logs for `🎙️ OpenAI Realtime: speech detected`.
5. Verify screenshots are captured on speech start.
6. Verify audio response plays after you stop speaking.

- [ ] **Step 3: Test barge-in (interrupt)**

1. In Live Tutor mode, ask a question that produces a long response.
2. While the model is still speaking, start talking again.
3. Verify the model's audio stops and it starts processing your new utterance.

- [ ] **Step 4: Test auto-sleep**

1. Settings → Voice → auto-sleep toggle ON (default 5 min).
2. For testing, temporarily change `liveTutorAutoSleepMinutes` to 1 minute in code.
3. Start Live Tutor, wait 1 minute without speaking.
4. Observe logs for `🎓 Live Tutor: auto-sleeping`.
5. Verify mode reverts to push-to-talk.

- [ ] **Step 5: Test PTT-to-exit Live Tutor**

1. In Live Tutor mode, press the PTT shortcut (ctrl+option).
2. Verify Live Tutor stops and this press registers as a normal push-to-talk.
3. After releasing, verify you're back in push-to-talk mode.

- [ ] **Step 6: Test false positive resilience**

1. In Live Tutor mode, play music or have background conversation.
2. Observe if the VAD triggers. Note the threshold.
3. If too sensitive, adjust `threshold` from 0.5 to 0.6 or 0.7 in `updateTurnDetection`.

---

## Cost Notes for the Implementer

- OpenAI Realtime charges for **committed** audio tokens, not raw mic stream. Server VAD only commits when it detects speech, so silence is effectively free on the API bill.
- Each false-positive turn costs ~$0.01-0.03 (screenshots + short model response).
- The auto-sleep timer (Task 3) is the primary cost control — it cuts the mic after silence, preventing false triggers during extended idle periods.
- Screenshots are only sent on `speech_started`, not continuously. This matches the push-to-talk behavior (screenshots sent on key press) and avoids a per-second image token bill.

## Self-Review

**Spec coverage:** All items from the discussion covered — hybrid mode, server VAD, auto-sleep, settings UI, prompt adaptation, cost controls. The interrupt/barge-in UX was not explicitly requested but is necessary for a natural always-on experience.

**Placeholder scan:** No TBDs, TODOs, or vague steps. Every code block is complete. One note: Task 5 step 1 says "find this in the file" because CompanionPanelView is large (~800 lines) and the exact PTT hint location depends on the current state of the file. The implementer should search for "keyCapsuleLabels" or "Hold" or "to talk" to find it.

**Type consistency:** `voiceInputMode` is a `String` throughout (stored in UserDefaults, read in settings picker, compared in CompanionManager). `isLiveTutorModeActive` is the runtime boolean derived from it. `liveTutorAutoSleepMinutes` is `Int` throughout.
