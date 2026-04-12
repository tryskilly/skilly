//
//  CompanionManager.swift
//  leanring-buddy
//
//  Central state manager for the companion voice mode. Owns the push-to-talk
//  pipeline (dictation manager + global shortcut monitor + overlay) and
//  exposes observable voice state for the panel UI.
//

import AVFoundation
import Combine
import Foundation
import PostHog
import ScreenCaptureKit
import SwiftUI

enum CompanionVoiceState {
    case idle
    case listening
    case processing
    case responding
}

@MainActor
final class CompanionManager: ObservableObject {
    @Published private(set) var voiceState: CompanionVoiceState = .idle
    @Published private(set) var lastTranscript: String?
    @Published private(set) var currentAudioPowerLevel: CGFloat = 0
    @Published private(set) var hasAccessibilityPermission = false
    @Published private(set) var hasScreenRecordingPermission = false
    @Published private(set) var hasMicrophonePermission = false
    @Published private(set) var hasScreenContentPermission = false

    /// Screen location (global AppKit coords) of a detected UI element the
    /// buddy should fly to and point at. Parsed from the model response;
    /// observed by BlueCursorView to trigger the flight animation.
    @Published var detectedElementScreenLocation: CGPoint?
    /// The display frame (global AppKit coords) of the screen the detected
    /// element is on, so BlueCursorView knows which screen overlay should animate.
    @Published var detectedElementDisplayFrame: CGRect?
    /// Custom speech bubble text for the pointing animation. When set,
    /// BlueCursorView uses this instead of a random pointer phrase.
    @Published var detectedElementBubbleText: String?
    /// Live transcript bubble text rendered in the same overlay as the cursor.
    /// This keeps the spoken response physically attached to the floating cursor.
    @Published private(set) var realtimeResponseBubbleText: String = ""
    /// True while the response transcript bubble should be visible beside the cursor.
    @Published private(set) var isShowingRealtimeResponseBubble: Bool = false

    // MARK: - Onboarding Video State (shared across all screen overlays)

    @Published var onboardingVideoPlayer: AVPlayer?
    @Published var showOnboardingVideo: Bool = false
    @Published var onboardingVideoOpacity: Double = 0.0
    private var onboardingVideoEndObserver: NSObjectProtocol?
    private var onboardingDemoTimeObserver: Any?

    // MARK: - Onboarding Prompt Bubble

    /// Text streamed character-by-character on the cursor after the onboarding video ends.
    @Published var onboardingPromptText: String = ""
    @Published var onboardingPromptOpacity: Double = 0.0
    @Published var showOnboardingPrompt: Bool = false

    // MARK: - Onboarding Music

    private var onboardingMusicPlayer: AVAudioPlayer?
    private var onboardingMusicFadeTimer: Timer?

    // MARK: - Skilly

    /// Optional skill manager — when set and a skill is active, the companion
    /// uses a composed system prompt with domain teaching instructions instead
    /// of the generic Skilly prompt. When nil or no skill active, original
    /// Skilly behavior is preserved.
    private var skillManager: SkillManager?

    func setSkillManager(_ manager: SkillManager) {
        self.skillManager = manager
    }

    /// Returns the skill-composed system prompt if a skill is active,
    /// otherwise falls back to the base Skilly prompt.
    private var composedSystemPrompt: String {
        if let skillManager,
           let composed = skillManager.composedSystemPrompt(basePrompt: Self.realtimeCompanionBasePrompt) {
            return composed
        }
        return Self.realtimeCompanionBasePrompt
    }

    // MARK: - Skilly Core

    let globalPushToTalkShortcutMonitor = GlobalPushToTalkShortcutMonitor()
    let overlayWindowManager = OverlayWindowManager()

    // MARK: - Skilly — OpenAI Realtime Pipeline
    let openAIRealtimeClient = OpenAIRealtimeClient()
    private var realtimeAudioPlayer: RealtimeAudioPlayer?  // Plays PCM16 24kHz
    private var realtimeEventSubscription: AnyCancellable?
    private var realtimeAudioEngine: AVAudioEngine?
    private var realtimePushToTalkTask: Task<Void, Never>?
    // MARK: - Skilly — Realtime transcript accumulation
    private var realtimeResponseText: String = ""
    private var currentTurnUserTranscript: String?
    /// Screen capture metadata for the current turn, used to map [POINT:x,y]
    /// tags from screenshot pixel space back into global AppKit screen space.
    private var currentTurnScreenCaptures: [CompanionScreenCapture] = []
    /// When the user pressed push-to-talk for the current turn. Used to
    /// measure turn duration for usage tracking (recorded on response.done).
    private var currentTurnStartTime: Date?

    /// Conversation history so Claude remembers prior exchanges within a session.
    /// Each entry is the user's transcript and Claude's response.
    private var conversationHistory: [(userTranscript: String, assistantResponse: String)] = []

    private var shortcutTransitionCancellable: AnyCancellable?
    // MARK: - Skilly — Escape key cancel
    private var escapeKeyCancellable: AnyCancellable?
    private var accessibilityCheckTimer: Timer?
    private var pendingKeyboardShortcutStartTask: Task<Void, Never>?
    /// Scheduled hide for transient cursor mode — cancelled if the user
    /// speaks again before the delay elapses.
    private var transientHideTask: Task<Void, Never>?
    /// True after `responseDone` while waiting for the realtime audio queue
    /// to finish playing. Prevents transcript bubble from hiding too early.
    private var isWaitingForRealtimeAudioQueueDrain = false
    private var voiceSettingCancellable: AnyCancellable?
    private var prewarmConnectionTask: Task<Void, Error>?
    private let minimumAudioChunksRequiredToCommit = 1
    private var hasEndedAssistantSpeechForCurrentTurn = false
    private var didReceivePointToolCallForCurrentTurn = false
    private var didReceiveAnyAudioChunkForCurrentTurn = false
    private var pendingToolCallIdForCurrentTurn: String?
    private var isAwaitingForcedSpokenFollowUp = false

    // MARK: - Skilly — Live Tutor mode state
    private var isLiveTutorModeActive = false
    private var liveTutorAudioEngine: AVAudioEngine?
    private var liveTutorAutoSleepTask: Task<Void, Never>?
    private var liveTutorSettingsCancellable: AnyCancellable?

    /// True when all three required permissions (accessibility, screen recording,
    /// microphone) are granted. Used by the panel to show a single "all good" state.
    var allPermissionsGranted: Bool {
        hasAccessibilityPermission && hasScreenRecordingPermission && hasMicrophonePermission && hasScreenContentPermission
    }

    /// Whether the blue cursor overlay is currently visible on screen.
    /// Used by the panel to show accurate status text ("Active" vs "Ready").
    @Published private(set) var isOverlayVisible: Bool = false

    /// User preference for whether the Skilly cursor should be shown.
    /// When toggled off, the overlay is hidden and push-to-talk is disabled.
    /// Persisted to UserDefaults so the choice survives app restarts.
    @Published var isSkillyCursorEnabled: Bool = UserDefaults.standard.object(forKey: "isSkillyCursorEnabled") == nil
        ? true
        : UserDefaults.standard.bool(forKey: "isSkillyCursorEnabled")

    func setSkillyCursorEnabled(_ enabled: Bool) {
        isSkillyCursorEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: "isSkillyCursorEnabled")
        transientHideTask?.cancel()
        transientHideTask = nil

        if enabled {
            overlayWindowManager.hasShownOverlayBefore = true
            overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
            isOverlayVisible = true
        } else {
            overlayWindowManager.hideOverlay()
            isOverlayVisible = false
        }
    }

    /// Whether the user has completed onboarding at least once. Persisted
    /// to UserDefaults so the Start button only appears on first launch.
    var hasCompletedOnboarding: Bool {
        get { UserDefaults.standard.bool(forKey: "hasCompletedOnboarding") }
        set { UserDefaults.standard.set(newValue, forKey: "hasCompletedOnboarding") }
    }

    /// Whether the user has submitted their email during onboarding.
    @Published var hasSubmittedEmail: Bool = UserDefaults.standard.bool(forKey: "hasSubmittedEmail")

    // MARK: - Skilly — Email submission: FormSpark endpoint removed for open-source.
    // The hasSubmittedEmail flag is set locally so the UI dismisses correctly.
    // Forks can add their own email collection here if desired.
    func submitEmail(_ email: String) {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedEmail.isEmpty else { return }

        hasSubmittedEmail = true
        UserDefaults.standard.set(true, forKey: "hasSubmittedEmail")
    }

    func start() {
        refreshAllPermissions()
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🔑 Skilly start — accessibility: \(hasAccessibilityPermission), screen: \(hasScreenRecordingPermission), mic: \(hasMicrophonePermission), screenContent: \(hasScreenContentPermission), onboarded: \(hasCompletedOnboarding)")
        #endif
        startPermissionPolling()
        bindShortcutTransitions()
        bindSettingsObservers()

        // If the user already completed onboarding AND all permissions are
        // still granted, show the cursor overlay immediately. If permissions
        // were revoked (e.g. signing change), don't show the cursor — the
        // panel will show the permissions UI instead.
        if hasCompletedOnboarding && allPermissionsGranted && isSkillyCursorEnabled {
            overlayWindowManager.hasShownOverlayBefore = true
            overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
            isOverlayVisible = true
        }

        if hasCompletedOnboarding && allPermissionsGranted {
            startRealtimeSessionPrewarmIfNeeded()
        }
    }

    /// Called by BlueCursorView after the buddy finishes its pointing
    /// animation and returns to cursor-following mode.
    /// Triggers the onboarding sequence — dismisses the panel and restarts
    /// the overlay so the welcome animation and intro video play.
    func triggerOnboarding() {
        // Post notification so the panel manager can dismiss the panel
        NotificationCenter.default.post(name: .skillyDismissPanel, object: nil)

        // Mark onboarding as completed so the Start button won't appear
        // again on future launches — the cursor will auto-show instead
        hasCompletedOnboarding = true

        SkillyAnalytics.trackOnboardingStarted()

        // Play Besaid theme at 60% volume, fade out after 1m 30s
        startOnboardingMusic()

        // Show the overlay for the first time — isFirstAppearance triggers
        // the welcome animation and onboarding video
        overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
        isOverlayVisible = true
    }

    /// Replays the onboarding experience from the "Watch Onboarding Again"
    /// footer link. Same flow as triggerOnboarding but the cursor overlay
    /// is already visible so we just restart the welcome animation and video.
    func replayOnboarding() {
        NotificationCenter.default.post(name: .skillyDismissPanel, object: nil)
        SkillyAnalytics.trackOnboardingReplayed()
        startOnboardingMusic()
        // Tear down any existing overlays and recreate with isFirstAppearance = true
        overlayWindowManager.hasShownOverlayBefore = false
        overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
        isOverlayVisible = true
    }

    private func stopOnboardingMusic() {
        onboardingMusicFadeTimer?.invalidate()
        onboardingMusicFadeTimer = nil
        onboardingMusicPlayer?.stop()
        onboardingMusicPlayer = nil
    }

    private func startOnboardingMusic() {
        stopOnboardingMusic()
        guard let musicURL = Bundle.main.url(forResource: "ff", withExtension: "mp3") else {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("⚠️ Skilly: ff.mp3 not found in bundle")
            #endif
            return
        }

        do {
            let player = try AVAudioPlayer(contentsOf: musicURL)
            player.volume = 0.3
            player.play()
            self.onboardingMusicPlayer = player

            // After 1m 30s, fade the music out over 3s
            onboardingMusicFadeTimer = Timer.scheduledTimer(withTimeInterval: 90.0, repeats: false) { [weak self] _ in
                self?.fadeOutOnboardingMusic()
            }
        } catch {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("⚠️ Skilly: Failed to play onboarding music: \(error)")
            #endif
        }
    }

    private func fadeOutOnboardingMusic() {
        guard let player = onboardingMusicPlayer else { return }

        let fadeSteps = 30
        let fadeDuration: Double = 3.0
        let stepInterval = fadeDuration / Double(fadeSteps)
        let volumeDecrement = player.volume / Float(fadeSteps)
        var stepsRemaining = fadeSteps

        onboardingMusicFadeTimer = Timer.scheduledTimer(withTimeInterval: stepInterval, repeats: true) { [weak self] timer in
            stepsRemaining -= 1
            player.volume -= volumeDecrement

            if stepsRemaining <= 0 {
                timer.invalidate()
                player.stop()
                self?.onboardingMusicPlayer = nil
                self?.onboardingMusicFadeTimer = nil
            }
        }
    }

    func clearDetectedElementLocation() {
        detectedElementScreenLocation = nil
        detectedElementDisplayFrame = nil
        detectedElementBubbleText = nil
    }

    func stop() {
        globalPushToTalkShortcutMonitor.stop()
        overlayWindowManager.hideOverlay()
        isWaitingForRealtimeAudioQueueDrain = false
        clearRealtimeResponseBubble()
        transientHideTask?.cancel()
        shortcutTransitionCancellable?.cancel()
        voiceSettingCancellable?.cancel()
        prewarmConnectionTask?.cancel()
        prewarmConnectionTask = nil
        accessibilityCheckTimer?.invalidate()
        accessibilityCheckTimer = nil

        let sessionDurationSeconds = TimeInterval(RealtimeTelemetry.shared.currentSessionDurationMs) / 1000
        recordSessionSecondsIfNeeded(sessionDurationSeconds)
        SkillyNotificationManager.shared.checkAndSendTrial80PercentWarning()
        SkillyNotificationManager.shared.checkAndSendUsage80PercentWarning()

        RealtimeTelemetry.shared.endSession()
        openAIRealtimeClient.disconnect()
    }

    private func recordSessionSecondsIfNeeded(_ seconds: TimeInterval) {
        guard seconds > 0 else { return }
        // MARK: - Skilly — Fall back to trial when no entitlement is set
        // (new user, offline, or Worker hasn't synced). This ensures
        // usage starts tracking immediately on first use.
        switch EntitlementManager.shared.status {
        case .trial, .none:
            // Ensure the trial has been started before recording seconds;
            // otherwise recordSessionSeconds bails out on !hasStarted.
            TrialTracker.shared.beginTrialIfNeeded()
            TrialTracker.shared.recordSessionSeconds(seconds)
        case .active, .canceled:
            UsageTracker.shared.recordSessionSeconds(seconds)
        case .expired:
            break
        }
    }

    func refreshAllPermissions() {
        let previouslyHadAccessibility = hasAccessibilityPermission
        let previouslyHadScreenRecording = hasScreenRecordingPermission
        let previouslyHadMicrophone = hasMicrophonePermission
        let previouslyHadAll = allPermissionsGranted

        let currentlyHasAccessibility = WindowPositionManager.hasAccessibilityPermission()
        hasAccessibilityPermission = currentlyHasAccessibility

        if currentlyHasAccessibility {
            globalPushToTalkShortcutMonitor.start()
        } else {
            globalPushToTalkShortcutMonitor.stop()
        }

        hasScreenRecordingPermission = WindowPositionManager.hasScreenRecordingPermission()

        let micAuthStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        hasMicrophonePermission = micAuthStatus == .authorized

        // Debug: log permission state on changes
        if previouslyHadAccessibility != hasAccessibilityPermission
            || previouslyHadScreenRecording != hasScreenRecordingPermission
            || previouslyHadMicrophone != hasMicrophonePermission {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("🔑 Permissions — accessibility: \(hasAccessibilityPermission), screen: \(hasScreenRecordingPermission), mic: \(hasMicrophonePermission), screenContent: \(hasScreenContentPermission)")
            #endif
        }

        // Track individual permission grants as they happen
        if !previouslyHadAccessibility && hasAccessibilityPermission {
            SkillyAnalytics.trackPermissionGranted(permission: "accessibility")
        }
        if !previouslyHadScreenRecording && hasScreenRecordingPermission {
            SkillyAnalytics.trackPermissionGranted(permission: "screen_recording")
        }
        if !previouslyHadMicrophone && hasMicrophonePermission {
            SkillyAnalytics.trackPermissionGranted(permission: "microphone")
        }
        // Screen content permission is persisted — once the user has approved the
        // SCShareableContent picker, we don't need to re-check it.
        if !hasScreenContentPermission {
            hasScreenContentPermission = UserDefaults.standard.bool(forKey: "hasScreenContentPermission")
        }

        if !previouslyHadAll && allPermissionsGranted {
            SkillyAnalytics.trackAllPermissionsGranted()
            if hasCompletedOnboarding {
                startRealtimeSessionPrewarmIfNeeded()
            }
        }
    }

    /// Triggers the macOS screen content picker by performing a dummy
    /// screenshot capture. Once the user approves, we persist the grant
    /// so they're never asked again during onboarding.
    @Published private(set) var isRequestingScreenContent = false

    func requestScreenContentPermission() {
        guard !isRequestingScreenContent else { return }
        isRequestingScreenContent = true
        Task {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                guard let display = content.displays.first else {
                    await MainActor.run { isRequestingScreenContent = false }
                    return
                }
                let filter = SCContentFilter(display: display, excludingWindows: [])
                let config = SCStreamConfiguration()
                config.width = 320
                config.height = 240
                let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
                // Verify the capture actually returned real content — a 0x0 or
                // fully-empty image means the user denied the prompt.
                let didCapture = image.width > 0 && image.height > 0
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("🔑 Screen content capture result — width: \(image.width), height: \(image.height), didCapture: \(didCapture)")
                #endif
                await MainActor.run {
                    isRequestingScreenContent = false
                    guard didCapture else { return }
                    hasScreenContentPermission = true
                    UserDefaults.standard.set(true, forKey: "hasScreenContentPermission")
                    SkillyAnalytics.trackPermissionGranted(permission: "screen_content")

                    // If onboarding was already completed, show the cursor overlay now
                    if hasCompletedOnboarding && allPermissionsGranted && !isOverlayVisible && isSkillyCursorEnabled {
                        overlayWindowManager.hasShownOverlayBefore = true
                        overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
                        isOverlayVisible = true
                    }
                }
            } catch {
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("⚠️ Screen content permission request failed: \(error)")
                #endif
                await MainActor.run { isRequestingScreenContent = false }
            }
        }
    }

    // MARK: - Private

    /// Triggers the system microphone prompt if the user has never been asked.
    /// Once granted/denied the status sticks and polling picks it up.
    private func promptForMicrophoneIfNotDetermined() {
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined else { return }
        AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
            Task { @MainActor [weak self] in
                self?.hasMicrophonePermission = granted
            }
        }
    }

    /// Polls all permissions frequently so the UI updates live after the
    /// user grants them in System Settings. Screen Recording is the exception —
    /// macOS requires an app restart for that one to take effect.
    private func startPermissionPolling() {
        accessibilityCheckTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.refreshAllPermissions()
            }
        }
    }

    private func bindShortcutTransitions() {
        shortcutTransitionCancellable = globalPushToTalkShortcutMonitor
            .shortcutTransitionPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] transition in
                self?.handleShortcutTransition(transition)
            }

        // MARK: - Skilly — Escape key to cancel recording or response
        escapeKeyCancellable = globalPushToTalkShortcutMonitor
            .escapeKeyPressedPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                self?.handleEscapeKeyPressed()
            }
    }

    private func bindSettingsObservers() {
        voiceSettingCancellable = AppSettings.shared.$voiceName
            .removeDuplicates()
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newVoiceName in
                guard let self else { return }
                Task { @MainActor in
                    do {
                        try await self.openAIRealtimeClient.updateVoice(voiceName: newVoiceName)
                    } catch {
                        #if DEBUG
                        print("⚠️ OpenAI Realtime: failed to update voice to \(newVoiceName): \(error)")
                        #endif
                    }
                }
            }

        // MARK: - Skilly — Live Tutor: react to voiceInputMode changes
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
    }

    private func startRealtimeSessionPrewarmIfNeeded() {
        guard prewarmConnectionTask == nil else { return }
        guard !openAIRealtimeClient.isConnected else { return }

        let configuredVoiceName = AppSettings.shared.voiceName
        let currentSystemPrompt = composedSystemPrompt
        prewarmConnectionTask = Task { @MainActor in
            try await openAIRealtimeClient.connect(
                systemPrompt: currentSystemPrompt,
                voiceName: configuredVoiceName
            )
            ensureRealtimeEventSubscriptionAndAudioPlayer()
        }
    }

    private func ensureRealtimeEventSubscriptionAndAudioPlayer() {
        if realtimeEventSubscription == nil {
            realtimeEventSubscription = openAIRealtimeClient.eventPublisher
                .receive(on: DispatchQueue.main)
                .sink { [weak self] event in
                    self?.handleRealtimeEvent(event)
                }
        }

        if realtimeAudioPlayer == nil {
            let realtimeAudioPlayer = RealtimeAudioPlayer()
            realtimeAudioPlayer.onQueueDrained = { [weak self] in
                Task { @MainActor [weak self] in
                    self?.handleRealtimeAudioQueueDrained()
                }
            }
            self.realtimeAudioPlayer = realtimeAudioPlayer
        }
    }

    private func ensureRealtimeSessionReadyForTurn() async throws {
        let configuredVoiceName = AppSettings.shared.voiceName
        let currentSystemPrompt = composedSystemPrompt

        let (allowed, reason) = EntitlementManager.shared.canStartTurn()
        if !allowed {
            NotificationCenter.default.post(
                name: .skillyTurnBlocked,
                object: nil,
                userInfo: reason.map { ["blockReason": $0] }
            )
            throw SkillManager.SkillAccessError.entitlementBlocked(reason ?? .subscriptionInactive)
        }

        if let prewarmConnectionTask {
            defer { self.prewarmConnectionTask = nil }
            _ = try await prewarmConnectionTask.value
        }

        if !openAIRealtimeClient.isConnected {
            try await openAIRealtimeClient.connect(
                systemPrompt: currentSystemPrompt,
                voiceName: configuredVoiceName
            )
            RealtimeTelemetry.shared.beginSession(model: openAIRealtimeClient.currentModel)
        } else {
            try await openAIRealtimeClient.updateSessionConfiguration(
                systemPrompt: currentSystemPrompt,
                voiceName: configuredVoiceName
            )
        }

        ensureRealtimeEventSubscriptionAndAudioPlayer()
    }

    // MARK: - Skilly — Escape Key Cancel Handler

    private func handleEscapeKeyPressed() {
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🛑 Escape handler: voiceState=\(voiceState), isModelSpeaking=\(openAIRealtimeClient.isModelSpeaking)")
        #endif

        // Check if the model is speaking even if voiceState hasn't updated
        if openAIRealtimeClient.isModelSpeaking {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("🛑 Escape: stopping AI response (model still speaking)")
            #endif
            openAIRealtimeClient.cancelResponse()
            realtimeAudioPlayer?.stop()
            isWaitingForRealtimeAudioQueueDrain = false
            voiceState = .idle
            clearRealtimeResponseBubble()
            return
        }

        switch voiceState {
        case .listening:
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("🛑 Escape: cancelling recording")
            #endif
            realtimeAudioEngine?.stop()
            realtimeAudioEngine?.inputNode.removeTap(onBus: 0)
            realtimeAudioEngine = nil
            realtimePushToTalkTask?.cancel()
            realtimePushToTalkTask = nil
            openAIRealtimeClient.clearAudioBuffer()
            isWaitingForRealtimeAudioQueueDrain = false
            voiceState = .idle
            clearRealtimeResponseBubble()

        case .processing:
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("🛑 Escape: cancelling pending response")
            #endif
            openAIRealtimeClient.cancelResponse()
            isWaitingForRealtimeAudioQueueDrain = false
            voiceState = .idle
            clearRealtimeResponseBubble()

        case .responding:
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("🛑 Escape: stopping AI response")
            #endif
            openAIRealtimeClient.cancelResponse()
            realtimeAudioPlayer?.stop()
            isWaitingForRealtimeAudioQueueDrain = false
            voiceState = .idle
            clearRealtimeResponseBubble()

        case .idle:
            break
        }
    }

    private func handleShortcutTransition(_ transition: BuddyPushToTalkShortcut.ShortcutTransition) {
        switch transition {
        case .pressed:
            // Don't register push-to-talk while the onboarding video is playing
            guard !showOnboardingVideo else { return }

            // MARK: - Skilly — In Live Tutor mode, the PTT shortcut toggles the
            // mode off and falls back to push-to-talk for this press.
            if isLiveTutorModeActive {
                stopLiveTutorMode()
                AppSettings.shared.voiceInputMode = "pushToTalk"
                // Fall through to normal PTT behavior below
            }

            // Cancel any pending transient hide so the overlay stays visible
            transientHideTask?.cancel()
            transientHideTask = nil

            // If the cursor is hidden, bring it back transiently for this interaction
            if !isSkillyCursorEnabled && !isOverlayVisible {
                overlayWindowManager.hasShownOverlayBefore = true
                overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
                isOverlayVisible = true
            }

            // Dismiss the menu bar panel so it doesn't cover the screen
            NotificationCenter.default.post(name: .skillyDismissPanel, object: nil)

            // MARK: - Skilly — Clear stale pointing state from previous utterance
            clearDetectedElementLocation()
            clearRealtimeResponseBubble()

            // Dismiss the onboarding prompt if it's showing
            if showOnboardingPrompt {
                withAnimation(.easeOut(duration: 0.3)) {
                    onboardingPromptOpacity = 0.0
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    self.showOnboardingPrompt = false
                    self.onboardingPromptText = ""
                }
            }
    

            SkillyAnalytics.trackPushToTalkStarted()

            // MARK: - Skilly — OpenAI Realtime pipeline
            startOpenAIRealtimePushToTalk()

        case .released:
            SkillyAnalytics.trackPushToTalkReleased()
            stopOpenAIRealtimePushToTalk()
        case .none:
            break
        }
    }

    // MARK: - Companion Prompt

    // MARK: - Skilly — Base prompt for realtime assistant responses
    private static let realtimeCompanionBasePrompt = """
    you're skilly, a friendly always-on teaching companion that lives in the user's menu bar. the user just spoke to you via push-to-talk and you can see their screen(s). your reply will be spoken aloud via text-to-speech, so write the way you'd actually talk. this is an ongoing conversation — you remember everything they've said before.

    rules:
    - default to one or two sentences. be direct and dense. BUT if the user asks you to explain more, go deeper, or elaborate, then go all out — give a thorough, detailed explanation with no length limit.
    - all lowercase, casual, warm. no emojis.
    - write for the ear, not the eye. short sentences. no lists, bullet points, markdown, or formatting — just natural speech.
    - don't use abbreviations or symbols that sound weird read aloud. write "for example" not "e.g.", spell out small numbers.
    - if the user's question relates to what's on their screen, reference specific things you see.
    - if the screenshot doesn't seem relevant to their question, just answer the question directly.
    - you can help with anything — coding, writing, general knowledge, brainstorming.
    - never say "simply" or "just".
    - don't read out code verbatim. describe what the code does or what needs to change conversationally.
    - focus on giving a thorough, useful explanation. don't end with simple yes/no questions like "want me to explain more?" or "should i show you?" — those are dead ends that force the user to just say yes.
    - instead, when it fits naturally, end by planting a seed — mention something bigger or more ambitious they could try, a related concept that goes deeper, or a next-level technique that builds on what you just explained. make it something worth coming back for, not a question they'd just nod to. it's okay to not end with anything extra if the answer is complete on its own.
    - if you receive multiple screen images, the one labeled "primary focus" is where the cursor is — prioritize that one but reference others if relevant.

    element pointing:
    you have a small blue cursor that can fly to and point at things on screen. use it whenever pointing would genuinely help the user — if they're asking how to do something, looking for a menu, trying to find a button, or need help navigating an app, point at the relevant element. err on the side of pointing rather than not pointing, because it makes your help way more useful and concrete.

    don't point at things when it would be pointless — like if the user asks a general knowledge question, or the conversation has nothing to do with what's on screen, or you'd just be pointing at something obvious they're already looking at. but if there's a specific UI element, menu, button, or area on screen that's relevant to what you're helping with, point at it.

    ABSOLUTE RULE: you must ALWAYS speak a spoken response to the user. speech is mandatory on every single turn. pointing is optional and additional. never respond with only a tool call and no speech — if you do, the user hears nothing and thinks skilly is broken. speak first, point second (in the same response).

    to point, call the `point_at_element` tool IN ADDITION to your spoken response. you emit both the spoken message AND the tool call as part of the same response. the tool takes:
    - x, y — integer pixel coordinates in the screenshot's coordinate space. the origin (0,0) is the top-left corner of the image. x increases rightward, y increases downward. the screenshot images are labeled with their pixel dimensions — use those dimensions as the coordinate space.
    - label — a short 1-3 word name of the element, like "frame tool" or "save button".
    - screen — optional 1-based screen number when there are multiple screenshots. omit if the element is on the cursor's screen. include it if the element is on a DIFFERENT screen (use the screen number from the image label). this is important — without the screen number, the cursor will point at the wrong place.

    never say "point", never read coordinates out loud, never mention the tool name, and never describe the tool call in your spoken response. the tool call is silent metadata — just speak naturally about what the user should do, and call the tool in parallel.

    if pointing wouldn't help (general question, nothing relevant on screen, obvious location), simply do not call the tool. still speak as normal. never call the tool with dummy values.

    when the user says things like "show me", "where is it", "can you point", "guide me" — they are asking for BOTH a spoken explanation AND the cursor moving. you must deliver both. do not interpret "show me" as "skip speech and only call the tool". always include the spoken explanation.

    examples (every example shows BOTH the spoken response AND the tool call — never one without the other when pointing):
    - user: "how do i color grade in final cut?" → you say: "you'll want to open the color inspector — it's right up in the top right area of the toolbar. click that and you'll get all the color wheels and curves." AND you call point_at_element with x=1100, y=42, label="color inspector"
    - user: "what is html?" → you say: "html stands for hypertext markup language, it's basically the skeleton of every web page. curious how it connects to the css you're looking at?" (no tool call — general knowledge question, speech only)
    - user: "can you show me how to commit in xcode?" → you say: "see that source control menu up top? click that and hit commit, or you can use command option c as a shortcut." AND you call point_at_element with x=285, y=11, label="source control"
    - user: "where's my terminal?" (on another monitor) → you say: "that's over on your other monitor — see the terminal window?" AND you call point_at_element with x=400, y=300, label="terminal", screen=2
    """

    /// If the cursor is in transient mode (user toggled "Show Skilly" off),
    /// waits for TTS playback and any pointing animation to finish, then
    /// fades out the overlay after a 1-second pause. Cancelled automatically
    /// if the user starts another push-to-talk interaction.
    private func scheduleTransientHideIfNeeded() {
        guard !isSkillyCursorEnabled && isOverlayVisible else { return }

        transientHideTask?.cancel()
        transientHideTask = Task {
            // MARK: - Skilly — Wait for realtime response playback to finish
            while openAIRealtimeClient.isModelSpeaking || voiceState == .responding {
                try? await Task.sleep(nanoseconds: 200_000_000)
                guard !Task.isCancelled else { return }
            }

            // Wait for pointing animation to finish (location is cleared
            // when the buddy flies back to the cursor)
            while detectedElementScreenLocation != nil {
                try? await Task.sleep(nanoseconds: 200_000_000)
                guard !Task.isCancelled else { return }
            }

            // Pause 1s after everything finishes, then fade out
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            overlayWindowManager.fadeOutAndHideOverlay()
            isOverlayVisible = false
        }
    }

    // MARK: - Realtime Response Bubble

    private func showRealtimeResponseBubble() {
        isShowingRealtimeResponseBubble = true
    }

    private func clearRealtimeResponseBubble() {
        isShowingRealtimeResponseBubble = false
        realtimeResponseBubbleText = ""
    }

    /// Keeps the transcript bubble clean while the model streams. This strips
    /// complete [POINT:...] tags and also hides a partially streamed trailing
    /// [POINT:... fragment so users never see protocol metadata.
    private func updateRealtimeResponseBubble(usingRawModelResponse rawModelResponseText: String) {
        let responseTextWithoutCompletePointTag = rawModelResponseText.replacingOccurrences(
            of: #"\s*\[POINT:[^\]]+\]\s*$"#,
            with: "",
            options: .regularExpression
        )
        let responseTextWithoutPointTagMetadata = responseTextWithoutCompletePointTag.replacingOccurrences(
            of: #"\s*\[POINT:[^\]]*$"#,
            with: "",
            options: .regularExpression
        )

        let cleanedResponseBubbleText = responseTextWithoutPointTagMetadata.trimmingCharacters(in: .whitespacesAndNewlines)
        realtimeResponseBubbleText = cleanedResponseBubbleText
        isShowingRealtimeResponseBubble = !cleanedResponseBubbleText.isEmpty
    }

    // MARK: - Point Directive Parsing

    private struct ParsedPointDirective {
        let screenshotXInPixels: Int
        let screenshotYInPixels: Int
        let elementLabel: String
        let oneBasedScreenNumber: Int?
    }

    private func applyPointDirectiveIfPresent(in fullModelResponseText: String) {
        guard let parsedPointDirective = parsePointDirective(from: fullModelResponseText),
              let targetScreenCapture = resolveTargetScreenCapture(for: parsedPointDirective) else {
            return
        }

        let screenLocation = mapScreenshotPixelCoordinateToGlobalScreenPoint(
            screenshotXInPixels: parsedPointDirective.screenshotXInPixels,
            screenshotYInPixels: parsedPointDirective.screenshotYInPixels,
            screenCapture: targetScreenCapture
        )

        detectedElementScreenLocation = screenLocation
        detectedElementDisplayFrame = targetScreenCapture.displayFrame
        detectedElementBubbleText = parsedPointDirective.elementLabel
        SkillyAnalytics.trackElementPointed(elementLabel: parsedPointDirective.elementLabel)
    }

    // MARK: - Skilly — Tool-call pointing directive
    /// Applies a pointing directive that arrived as a structured function
    /// call from gpt-realtime, instead of as an inline [POINT:...] text tag.
    /// This is the preferred path — it keeps coordinates out of the audio
    /// and text streams entirely, so the TTS never voices them.
    private func applyPointDirectiveFromToolCall(argumentsJSON: String) {
        guard let argumentsData = argumentsJSON.data(using: .utf8),
              let parsedArguments = try? JSONSerialization.jsonObject(with: argumentsData) as? [String: Any] else {
            #if DEBUG
            print("⚠️ point_at_element: could not parse arguments JSON")
            #endif
            return
        }

        // Accept integers or doubles for x/y.
        let screenshotXInPixels: Int
        let screenshotYInPixels: Int
        if let integerX = parsedArguments["x"] as? Int {
            screenshotXInPixels = integerX
        } else if let doubleX = parsedArguments["x"] as? Double {
            screenshotXInPixels = Int(doubleX)
        } else {
            return
        }
        if let integerY = parsedArguments["y"] as? Int {
            screenshotYInPixels = integerY
        } else if let doubleY = parsedArguments["y"] as? Double {
            screenshotYInPixels = Int(doubleY)
        } else {
            return
        }

        guard let elementLabel = (parsedArguments["label"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
              !elementLabel.isEmpty else {
            return
        }

        // Optional 1-based screen index when the model is pointing on a
        // different display than the one the cursor is currently on.
        var oneBasedScreenNumber: Int?
        if let integerScreen = parsedArguments["screen"] as? Int {
            oneBasedScreenNumber = integerScreen
        } else if let doubleScreen = parsedArguments["screen"] as? Double {
            oneBasedScreenNumber = Int(doubleScreen)
        }

        let parsedPointDirective = ParsedPointDirective(
            screenshotXInPixels: screenshotXInPixels,
            screenshotYInPixels: screenshotYInPixels,
            elementLabel: elementLabel,
            oneBasedScreenNumber: oneBasedScreenNumber
        )
        guard let targetScreenCapture = resolveTargetScreenCapture(for: parsedPointDirective) else {
            return
        }

        let screenLocation = mapScreenshotPixelCoordinateToGlobalScreenPoint(
            screenshotXInPixels: parsedPointDirective.screenshotXInPixels,
            screenshotYInPixels: parsedPointDirective.screenshotYInPixels,
            screenCapture: targetScreenCapture
        )

        detectedElementScreenLocation = screenLocation
        detectedElementDisplayFrame = targetScreenCapture.displayFrame
        detectedElementBubbleText = parsedPointDirective.elementLabel
        SkillyAnalytics.trackElementPointed(elementLabel: parsedPointDirective.elementLabel)
    }

    private func parsePointDirective(from responseText: String) -> ParsedPointDirective? {
        guard let regularExpression = try? NSRegularExpression(pattern: #"\[POINT:([^\]]+)\]"#) else {
            return nil
        }

        let fullResponseRange = NSRange(responseText.startIndex..<responseText.endIndex, in: responseText)
        let allMatches = regularExpression.matches(in: responseText, range: fullResponseRange)
        guard let lastPointMatch = allMatches.last,
              lastPointMatch.numberOfRanges > 1,
              let payloadRange = Range(lastPointMatch.range(at: 1), in: responseText) else {
            return nil
        }

        let payload = responseText[payloadRange].trimmingCharacters(in: .whitespacesAndNewlines)
        if payload.caseInsensitiveCompare("none") == .orderedSame {
            return nil
        }

        let payloadSegments = payload
            .split(separator: ":", omittingEmptySubsequences: false)
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }

        guard payloadSegments.count >= 2 else { return nil }

        let coordinateSegment = payloadSegments[0]
        let coordinateComponents = coordinateSegment
            .split(separator: ",", omittingEmptySubsequences: false)
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        guard coordinateComponents.count == 2,
              let screenshotXInPixels = Int(coordinateComponents[0]),
              let screenshotYInPixels = Int(coordinateComponents[1]) else {
            return nil
        }

        var labelSegments = Array(payloadSegments.dropFirst())
        var oneBasedScreenNumber: Int?
        if let lastSegment = labelSegments.last?.lowercased(),
           lastSegment.hasPrefix("screen"),
           let parsedScreenNumber = Int(lastSegment.replacingOccurrences(of: "screen", with: "")) {
            oneBasedScreenNumber = parsedScreenNumber
            labelSegments.removeLast()
        }

        let elementLabel = labelSegments
            .joined(separator: ":")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !elementLabel.isEmpty else { return nil }

        return ParsedPointDirective(
            screenshotXInPixels: screenshotXInPixels,
            screenshotYInPixels: screenshotYInPixels,
            elementLabel: elementLabel,
            oneBasedScreenNumber: oneBasedScreenNumber
        )
    }

    private func resolveTargetScreenCapture(for parsedPointDirective: ParsedPointDirective) -> CompanionScreenCapture? {
        guard !currentTurnScreenCaptures.isEmpty else {
            return nil
        }

        if let oneBasedScreenNumber = parsedPointDirective.oneBasedScreenNumber {
            let zeroBasedScreenIndex = oneBasedScreenNumber - 1
            if currentTurnScreenCaptures.indices.contains(zeroBasedScreenIndex) {
                return currentTurnScreenCaptures[zeroBasedScreenIndex]
            }
        }

        return currentTurnScreenCaptures.first(where: { $0.isCursorScreen }) ?? currentTurnScreenCaptures.first
    }

    private func mapScreenshotPixelCoordinateToGlobalScreenPoint(
        screenshotXInPixels: Int,
        screenshotYInPixels: Int,
        screenCapture: CompanionScreenCapture
    ) -> CGPoint {
        let clampedXInPixels = max(0, min(screenshotXInPixels, screenCapture.screenshotWidthInPixels))
        let clampedYInPixels = max(0, min(screenshotYInPixels, screenCapture.screenshotHeightInPixels))

        let normalizedX = CGFloat(clampedXInPixels) / CGFloat(max(screenCapture.screenshotWidthInPixels, 1))
        let normalizedY = CGFloat(clampedYInPixels) / CGFloat(max(screenCapture.screenshotHeightInPixels, 1))

        let globalX = screenCapture.displayFrame.minX + (screenCapture.displayFrame.width * normalizedX)
        let globalY = screenCapture.displayFrame.maxY - (screenCapture.displayFrame.height * normalizedY)
        return CGPoint(x: globalX, y: globalY)
    }

    // MARK: - Skilly — OpenAI Realtime Push-to-Talk Pipeline

    private func startOpenAIRealtimePushToTalk() {
        realtimePushToTalkTask?.cancel()
        // MARK: - Skilly — Reset response transcript buffer for each new turn
        realtimeResponseText = ""
        currentTurnUserTranscript = nil
        currentTurnScreenCaptures = []
        hasEndedAssistantSpeechForCurrentTurn = false
        didReceivePointToolCallForCurrentTurn = false
        didReceiveAnyAudioChunkForCurrentTurn = false
        pendingToolCallIdForCurrentTurn = nil
        isAwaitingForcedSpokenFollowUp = false
        isWaitingForRealtimeAudioQueueDrain = false
        // MARK: - Skilly — Record turn start for usage tracking (key press → response.done)
        currentTurnStartTime = Date()
        clearRealtimeResponseBubble()

        realtimePushToTalkTask = Task {
            let pipelineStartTime = CFAbsoluteTimeGetCurrent()
            voiceState = .listening

            do {
                try await ensureRealtimeSessionReadyForTurn()
                RealtimeTelemetry.shared.beginTurn()

                guard !Task.isCancelled else { return }

                // Clear any stale audio from previous interaction
                openAIRealtimeClient.clearAudioBuffer()
                realtimeAudioChunksSent = 0

                // Capture and send all screens immediately so the model can reason
                // across multi-monitor setups and map [POINT] tags correctly.
                let allScreenCaptures = try await CompanionScreenCaptureUtility.captureAllScreensAsJPEG()
                currentTurnScreenCaptures = allScreenCaptures
                RealtimeTelemetry.shared.recordVisionUsed()
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

                    // MARK: - Skilly — Debug logging (stripped in release)
                    #if DEBUG
                    let sendLatencyMilliseconds = Int((CFAbsoluteTimeGetCurrent() - pipelineStartTime) * 1000)
                    print("⏱️ OpenAI Realtime: screen \(screenIndex + 1)/\(allScreenCaptures.count) sent (\(screenCapture.imageData.count / 1024)KB) at \(sendLatencyMilliseconds)ms")
                    #endif
                }

                RealtimeTelemetry.shared.beginUserSpeech()

                // Start audio capture and stream to OpenAI
                let audioEngine = AVAudioEngine()
                self.realtimeAudioEngine = audioEngine

                let inputNode = audioEngine.inputNode
                let inputFormat = inputNode.outputFormat(forBus: 0)

                inputNode.installTap(onBus: 0, bufferSize: 1600, format: inputFormat) { [weak self] buffer, _ in
                    guard let pcm16Data = self?.convertBufferToPCM16(buffer) else { return }
                    self?.openAIRealtimeClient.appendAudioChunk(pcm16Data)
                    self?.realtimeAudioChunksSent += 1
                    self?.updateRealtimeAudioPowerLevel(from: buffer)
                }

                audioEngine.prepare()
                try audioEngine.start()

                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("⏱️ OpenAI Realtime: audio streaming started at \(Int((CFAbsoluteTimeGetCurrent() - pipelineStartTime) * 1000))ms")
                #endif

            } catch {
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("⚠️ OpenAI Realtime: failed to start: \(error)")
                #endif
                voiceState = .idle
                clearRealtimeResponseBubble()
            }
        }
    }

    /// Tracks whether we've actually sent any audio chunks this press.
    private var realtimeAudioChunksSent = 0

    private func stopOpenAIRealtimePushToTalk() {
        // Stop audio capture
        realtimeAudioEngine?.stop()
        realtimeAudioEngine?.inputNode.removeTap(onBus: 0)
        realtimeAudioEngine = nil
        realtimePushToTalkTask = nil

        // Only commit if we've actually sent audio
        if realtimeAudioChunksSent >= minimumAudioChunksRequiredToCommit {
            RealtimeTelemetry.shared.endUserSpeech()
            openAIRealtimeClient.commitAudioAndRespond()
            voiceState = .processing
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("🎙️ OpenAI Realtime: committed \(realtimeAudioChunksSent) audio chunks")
            #endif
        } else {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("⚠️ OpenAI Realtime: not enough audio captured (\(realtimeAudioChunksSent) chunks), skipping commit")
            #endif
            isWaitingForRealtimeAudioQueueDrain = false
            voiceState = .idle
            clearRealtimeResponseBubble()
        }
        realtimeAudioChunksSent = 0
    }

    // MARK: - Skilly — Live Tutor Mode Pipeline

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

            resetLiveTutorAutoSleepTimer()
        }
    }

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

        Task {
            try? await openAIRealtimeClient.updateTurnDetection(enabled: false)
        }

        voiceState = .idle
        clearRealtimeResponseBubble()
    }

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

    private func handleRealtimeEvent(_ event: OpenAIRealtimeEvent) {
        switch event {
        case .sessionCreated:
            break

        case .audioChunk(let pcm16Data):
            if voiceState != .responding {
                voiceState = .responding
                isWaitingForRealtimeAudioQueueDrain = false
                showRealtimeResponseBubble()
                RealtimeTelemetry.shared.beginAssistantSpeech()
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("🔊 OpenAI Realtime: voiceState → responding")
                #endif
            }
            // MARK: - Skilly — Track whether this turn produced any spoken
            // audio. If a response completes with a tool call but no audio,
            // we force a spoken follow-up in .responseDone below.
            didReceiveAnyAudioChunkForCurrentTurn = true
            realtimeAudioPlayer?.enqueueAudio(pcm16Data)

        case .audioTranscriptDelta(let text):
            // MARK: - Skilly — Stream AI response text to cursor overlay
            realtimeResponseText += text
            // The [POINT:...] tag is silent-metadata per the system prompt
            // (gpt-realtime does not generate speech tokens for text it is
            // told to treat as silent directives). We used to drop audio
            // chunks whenever "[point:" appeared in the text stream, but that
            // cut off real speech whenever the model emitted the tag inline
            // instead of strictly at the end. The tag is stripped from the
            // visible bubble by updateRealtimeResponseBubble and from the
            // curriculum transcript in .responseDone below.
            updateRealtimeResponseBubble(usingRawModelResponse: realtimeResponseText)

        case .inputTranscriptDone(let transcript):
            // What the user said (STT result)
            lastTranscript = transcript
            currentTurnUserTranscript = transcript
            SkillyAnalytics.trackUserMessageSent(transcript: transcript)

        case .responseDone(let usage):
            // MARK: - Skilly — Runtime recovery for tool-call-only responses
            // gpt-realtime sometimes emits a function_call item with no
            // message item, which means no audio is generated and the user
            // hears silence. When we detect that, close the tool call with
            // a trivial function_call_output and immediately request a
            // forced spoken follow-up (tool_choice: "none"). The follow-up
            // will arrive as a NEW .responseDone event; this second pass
            // takes the normal completion path below.
            let shouldForceSpokenFollowUp = didReceivePointToolCallForCurrentTurn
                && !didReceiveAnyAudioChunkForCurrentTurn
                && !isAwaitingForcedSpokenFollowUp
            if shouldForceSpokenFollowUp {
                #if DEBUG
                print("🗣️ OpenAI Realtime: tool-only response detected, forcing spoken follow-up")
                #endif
                if let pendingToolCallId = pendingToolCallIdForCurrentTurn {
                    openAIRealtimeClient.sendFunctionCallOutput(
                        callId: pendingToolCallId,
                        output: #"{"ok":true}"#
                    )
                }
                isAwaitingForcedSpokenFollowUp = true
                // We intentionally do NOT reset didReceivePointToolCallForCurrentTurn
                // here — the point was already applied and we don't want the
                // second response to point again. We DO need to allow new audio
                // to arrive for the follow-up, which is already allowed because
                // didReceiveAnyAudioChunkForCurrentTurn simply gets set when
                // the first forced-speech chunk arrives.
                openAIRealtimeClient.requestForcedSpokenResponse(
                    instruction: "Now provide your normal spoken explanation for the user's last question. Speak naturally and conversationally, as if you were answering them out loud. Do not call any tools. Do not mention that you are pointing, do not say coordinates, and do not refer to the tool you just invoked. Just give the explanation."
                )
                return
            }

            RealtimeTelemetry.shared.endTurn(usage: usage)
            if !hasEndedAssistantSpeechForCurrentTurn {
                RealtimeTelemetry.shared.endAssistantSpeech()
                hasEndedAssistantSpeechForCurrentTurn = true
            }
            // MARK: - Skilly — Record per-turn usage for trial/cap tracking
            if let turnStart = currentTurnStartTime {
                let turnDurationSeconds = Date().timeIntervalSince(turnStart)
                recordSessionSecondsIfNeeded(turnDurationSeconds)
                // Fire the first-turn milestone on the very first trial turn
                TrialTracker.shared.recordFirstTurn()
                // Check for 80% warning thresholds after each recording
                SkillyNotificationManager.shared.checkAndSendTrial80PercentWarning()
                SkillyNotificationManager.shared.checkAndSendUsage80PercentWarning()
            }
            currentTurnStartTime = nil
            isAwaitingForcedSpokenFollowUp = false
            // Fallback: only parse inline [POINT:...] text tags if the model
            // did NOT already call the point_at_element tool for this turn.
            // New turns should always use the tool; legacy inline tags are
            // kept as a safety net in case the model ignores the tool.
            if !didReceivePointToolCallForCurrentTurn {
                applyPointDirectiveIfPresent(in: realtimeResponseText)
            }
            if let currentTurnUserTranscript {
                let cleanedAssistantResponse = realtimeResponseText.replacingOccurrences(
                    of: #"\s*\[POINT:[^\]]+\]\s*$"#,
                    with: "",
                    options: .regularExpression
                )
                skillManager?.didReceiveInteraction(
                    transcript: currentTurnUserTranscript,
                    assistantResponse: cleanedAssistantResponse.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            }
            self.currentTurnUserTranscript = nil
            // Wait for audio queue drain instead of a fixed timer so the
            // transcript remains visible for the full spoken response.
            isWaitingForRealtimeAudioQueueDrain = true
            if realtimeAudioPlayer?.hasPendingAudio != true {
                handleRealtimeAudioQueueDrained()
            }

        case .functionCallDone(let name, let argumentsJSON, let callId):
            // MARK: - Skilly — Tool call handler
            // gpt-realtime invokes point_at_element as a structured function
            // call that arrives alongside (but separately from) the spoken
            // message. We route it straight to the pointing animation without
            // touching the audio/text stream. We also save the call_id so
            // we can close the call with function_call_output in .responseDone.
            if name == "point_at_element" {
                applyPointDirectiveFromToolCall(argumentsJSON: argumentsJSON)
                didReceivePointToolCallForCurrentTurn = true
                pendingToolCallIdForCurrentTurn = callId
            }

        case .speechStarted:
            // MARK: - Skilly — Live Tutor: server detected speech
            guard isLiveTutorModeActive else { break }
            resetLiveTutorAutoSleepTimer()

            // If model is currently speaking, cancel (barge-in)
            if voiceState == .responding {
                openAIRealtimeClient.cancelResponse()
                realtimeAudioPlayer?.stop()
                #if DEBUG
                print("🎓 Live Tutor: user interrupted model, cancelling response")
                #endif
            }

            // Reset per-turn state
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

            // Show overlay if hidden
            if !isSkillyCursorEnabled && !isOverlayVisible {
                overlayWindowManager.hasShownOverlayBefore = true
                overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
                isOverlayVisible = true
            }

            // Capture screenshots for visual context
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
            voiceState = .processing
            #if DEBUG
            print("🎓 Live Tutor: speech ended, server auto-committed")
            #endif

        case .error(let message):
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("⚠️ OpenAI Realtime error: \(message)")
            #endif
            hasEndedAssistantSpeechForCurrentTurn = false
            isWaitingForRealtimeAudioQueueDrain = false
            voiceState = .idle
            clearRealtimeResponseBubble()
        }
    }

    private func handleRealtimeAudioQueueDrained() {
        guard isWaitingForRealtimeAudioQueueDrain else { return }
        isWaitingForRealtimeAudioQueueDrain = false
        voiceState = .idle
        clearRealtimeResponseBubble()
        scheduleTransientHideIfNeeded()
        if !hasEndedAssistantSpeechForCurrentTurn {
            RealtimeTelemetry.shared.endAssistantSpeech()
            hasEndedAssistantSpeechForCurrentTurn = true
        }
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🔊 OpenAI Realtime: voiceState → idle (audio queue drained)")
        #endif
    }

    private func updateRealtimeAudioPowerLevel(from buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData?[0] else { return }
        let frameCount = Int(buffer.frameLength)
        var sum: Float = 0
        for i in 0..<frameCount { sum += abs(channelData[i]) }
        let power = CGFloat(min(1.0, (sum / Float(frameCount)) * 5.0))
        Task { @MainActor in self.currentAudioPowerLevel = power }
    }

    /// Convert AVAudioPCMBuffer to PCM16 mono 16kHz for OpenAI Realtime.
    private func convertBufferToPCM16(_ buffer: AVAudioPCMBuffer) -> Data? {
        guard let floatData = buffer.floatChannelData else { return nil }
        let frameCount = Int(buffer.frameLength)
        let channelCount = Int(buffer.format.channelCount)
        let ratio = buffer.format.sampleRate / 16000.0
        let targetFrameCount = Int(Double(frameCount) / ratio)

        var pcm16 = Data(capacity: targetFrameCount * 2)
        for i in 0..<targetFrameCount {
            let srcFrame = min(Int(Double(i) * ratio), frameCount - 1)
            var sample: Float = 0
            for ch in 0..<channelCount { sample += floatData[ch][srcFrame] }
            sample /= Float(channelCount)
            var int16 = Int16(max(-1, min(1, sample)) * Float(Int16.max))
            pcm16.append(Data(bytes: &int16, count: 2))
        }
        return pcm16
    }

    // MARK: - Onboarding Video

    /// Sets up the onboarding video player, starts playback, and schedules
    /// the demo interaction at 40s. Called by BlueCursorView when onboarding starts.
    func setupOnboardingVideo() {
        // MARK: - Skilly — Onboarding video URL is now configurable via AppSettings
        let videoURLString = AppSettings.shared.onboardingVideoURL
        guard !videoURLString.isEmpty, let videoURL = URL(string: videoURLString) else { return }

        let player = AVPlayer(url: videoURL)
        player.isMuted = false
        player.volume = 0.0
        self.onboardingVideoPlayer = player
        self.showOnboardingVideo = true
        self.onboardingVideoOpacity = 0.0

        // Start playback immediately — the video plays while invisible,
        // then we fade in both the visual and audio over 1s.
        player.play()

        // Wait for SwiftUI to mount the view, then set opacity to 1.
        // The .animation modifier on the view handles the actual animation.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            self.onboardingVideoOpacity = 1.0
            // Fade audio volume from 0 → 1 over 2s to match visual fade
            self.fadeInVideoAudio(player: player, targetVolume: 1.0, duration: 2.0)
        }

        // At 40 seconds into the video, trigger the onboarding demo where
        // Skilly flies to something interesting on screen and comments on it
        let demoTriggerTime = CMTime(seconds: 40, preferredTimescale: 600)
        onboardingDemoTimeObserver = player.addBoundaryTimeObserver(
            forTimes: [NSValue(time: demoTriggerTime)],
            queue: .main
        ) { [weak self] in
            SkillyAnalytics.trackOnboardingDemoTriggered()
            self?.performOnboardingDemoInteraction()
        }

        // Fade out and clean up when the video finishes
        onboardingVideoEndObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            SkillyAnalytics.trackOnboardingVideoCompleted()
            self.onboardingVideoOpacity = 0.0
            // Wait for the 2s fade-out animation to complete before tearing down
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                self.tearDownOnboardingVideo()
                // After the video disappears, stream in the prompt to try talking
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    self.startOnboardingPromptStream()
                }
            }
        }
    }

    func tearDownOnboardingVideo() {
        showOnboardingVideo = false
        if let timeObserver = onboardingDemoTimeObserver {
            onboardingVideoPlayer?.removeTimeObserver(timeObserver)
            onboardingDemoTimeObserver = nil
        }
        onboardingVideoPlayer?.pause()
        onboardingVideoPlayer = nil
        if let observer = onboardingVideoEndObserver {
            NotificationCenter.default.removeObserver(observer)
            onboardingVideoEndObserver = nil
        }
    }

    private func startOnboardingPromptStream() {
        let message = "press control + option and introduce yourself"
        onboardingPromptText = ""
        showOnboardingPrompt = true
        onboardingPromptOpacity = 0.0

        withAnimation(.easeIn(duration: 0.4)) {
            onboardingPromptOpacity = 1.0
        }

        var currentIndex = 0
        Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { timer in
            guard currentIndex < message.count else {
                timer.invalidate()
                // Auto-dismiss after 10 seconds
                DispatchQueue.main.asyncAfter(deadline: .now() + 10.0) {
                    guard self.showOnboardingPrompt else { return }
                    withAnimation(.easeOut(duration: 0.3)) {
                        self.onboardingPromptOpacity = 0.0
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        self.showOnboardingPrompt = false
                        self.onboardingPromptText = ""
                    }
                }
                return
            }
            let index = message.index(message.startIndex, offsetBy: currentIndex)
            self.onboardingPromptText.append(message[index])
            currentIndex += 1
        }
    }

    /// Gradually raises an AVPlayer's volume from its current level to the
    /// target over the specified duration, creating a smooth audio fade-in.
    private func fadeInVideoAudio(player: AVPlayer, targetVolume: Float, duration: Double) {
        let steps = 20
        let stepInterval = duration / Double(steps)
        let volumeIncrement = (targetVolume - player.volume) / Float(steps)
        var stepsRemaining = steps

        Timer.scheduledTimer(withTimeInterval: stepInterval, repeats: true) { timer in
            stepsRemaining -= 1
            player.volume += volumeIncrement

            if stepsRemaining <= 0 {
                timer.invalidate()
                player.volume = targetVolume
            }
        }
    }

    // MARK: - Onboarding Demo Interaction

    func performOnboardingDemoInteraction() {
        // MARK: - Skilly — Onboarding demo uses realtime pipeline (classic Claude pipeline removed)
    }
}
