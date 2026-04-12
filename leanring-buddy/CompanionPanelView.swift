//
//  CompanionPanelView.swift
//  leanring-buddy
//
//  The SwiftUI content hosted inside the menu bar panel. Shows the companion
//  voice status, push-to-talk shortcut, and quick settings. Designed to feel
//  like Loom's recording panel — dark, rounded, minimal, and special.
//

import AVFoundation
import SwiftUI

struct CompanionPanelView: View {
    @ObservedObject var companionManager: CompanionManager
    // MARK: - Skilly
    var skillManager: SkillManager?
    var authManager: AuthManager?
    @State private var emailInput: String = ""
    // MARK: - Skilly — Settings
    @State private var showSettings = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            panelHeader

            Divider()
                .background(DS.Colors.borderSubtle)
                .padding(.horizontal, 16)

            if !companionManager.allPermissionsGranted {
                permissionsCopySection
                    .padding(.top, 16)
                    .padding(.horizontal, 16)

                Spacer().frame(height: 16)

                settingsSection
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
            } else if !(authManager?.isSignedIn ?? true) {
                permissionsCopySection
                    .padding(.top, 16)
                    .padding(.horizontal, 16)

                Spacer().frame(height: 16)

                startButton
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
            } else if !companionManager.hasCompletedOnboarding {
                permissionsCopySection
                    .padding(.top, 16)
                    .padding(.horizontal, 16)

                Spacer().frame(height: 16)

                onboardingStartButton
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
            } else if let skillManager {
                // Main content — single unified view, no navigation
                PanelBodyView(skillManager: skillManager)
            }

            Divider()
                .background(DS.Colors.borderSubtle)

            // Always-visible push-to-talk hint strip
            if companionManager.hasCompletedOnboarding && companionManager.allPermissionsGranted {
                pttHintStrip
                    .padding(.horizontal, 16)
                    .padding(.vertical, 9)

                Divider()
                    .background(DS.Colors.borderSubtle)
            }

            // Flat 3-link footer
            flatFooter
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
        }
        .frame(width: 300)
        .clipShape(RoundedRectangle(cornerRadius: DS.CornerRadius.extraLarge, style: .continuous))
        .background(panelBackground)
        .preferredColorScheme(.dark)
    }

    // MARK: - Push-to-talk Hint Strip (always visible)

    private var pttHintStrip: some View {
        HStack(spacing: 6) {
            Spacer()
            Text("Hold")
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textTertiary)
            keyCap("⌃")
            keyCap("⌥")
            Text("to talk")
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textTertiary)
            Spacer()
        }
    }

    private func keyCap(_ symbol: String) -> some View {
        Text(symbol)
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .foregroundColor(DS.Colors.textSecondary)
            .frame(width: 18, height: 18)
            .background(
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(Color.white.opacity(0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .stroke(Color.white.opacity(0.12), lineWidth: 0.5)
            )
    }

    // MARK: - Flat Footer (Feedback · Quit · Sign out)

    private var flatFooter: some View {
        HStack {
            footerButton(label: "Feedback", icon: "bubble.left") {
                if let url = URL(string: "https://tryskilly.app") {
                    NSWorkspace.shared.open(url)
                }
            }

            Spacer()

            footerButton(label: "Quit", icon: nil) {
                NSApp.terminate(nil)
            }

            Spacer()

            if authManager?.isSignedIn == true {
                footerButton(label: "Sign out", icon: nil) {
                    authManager?.signOut()
                }
            } else {
                // Keep spacing consistent when signed out
                Color.clear.frame(width: 60, height: 1)
            }
        }
    }

    private func footerButton(label: String, icon: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 10))
                }
                Text(label)
                    .font(.system(size: 11))
            }
            .foregroundColor(DS.Colors.textTertiary)
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    // MARK: - Header

    private var panelHeader: some View {
        HStack {
            HStack(spacing: 6) {
                // Skilly logo icon — sized to match the panel title (15px)
                Image("SkillyCursor")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 18, height: 18)

                Text("Skilly")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(DS.Colors.textPrimary)
            }

            Spacer()
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(DS.Colors.textTertiary)

            // MARK: - Skilly — Settings gear button
            Button(action: { showSettings.toggle() }) {
                Image(systemName: "gearshape")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(DS.Colors.textTertiary)
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .pointerCursor()
            .popover(isPresented: $showSettings) {
                SettingsView(
                    settings: AppSettings.shared,
                    skillManager: skillManager,
                    authManager: authManager,
                    companionManager: companionManager
                )
            }
            // MARK: - Skilly — Accessibility
            .accessibilityLabel("Settings")
            .accessibilityHint("Opens app settings")

            Button(action: {
                NotificationCenter.default.post(name: .skillyDismissPanel, object: nil)
            }) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(DS.Colors.textTertiary)
                    .frame(width: 20, height: 20)
                    .background(
                        Circle()
                            .fill(Color.white.opacity(0.08))
                    )
            }
            .buttonStyle(.plain)
            .pointerCursor()
            // MARK: - Skilly — Accessibility
            .accessibilityLabel("Close panel")
            .accessibilityHint("Dismisses the Skilly panel")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    // MARK: - Permissions Copy

    @ViewBuilder
    private var permissionsCopySection: some View {
        if companionManager.hasCompletedOnboarding && companionManager.allPermissionsGranted && (authManager?.isSignedIn ?? true) {
            Text("Hold Control+Option to talk.")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(DS.Colors.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else if companionManager.allPermissionsGranted && !(authManager?.isSignedIn ?? true) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Sign in to get started.")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(DS.Colors.textSecondary)
                Text("Create an account to start learning with Skilly.")
                    .font(.system(size: 11))
                    .foregroundColor(DS.Colors.textTertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else if companionManager.allPermissionsGranted {
            Text("You're all set. Hit Start to meet Skilly.")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(DS.Colors.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else if companionManager.hasCompletedOnboarding {
            // Permissions were revoked after onboarding — tell user to re-grant
            VStack(alignment: .leading, spacing: 6) {
                Text("Permissions needed")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DS.Colors.textSecondary)

                Text("Some permissions were revoked. Grant all four below to keep using Skilly.")
                    .font(.system(size: 11))
                    .foregroundColor(DS.Colors.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("Welcome to Skilly.")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DS.Colors.textSecondary)

                Text("An AI teaching companion that sees your screen, speaks to you, and points at UI elements.")
                    .font(.system(size: 11))
                    .foregroundColor(DS.Colors.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)

                Text("Nothing runs in the background. Skilly will only take a screenshot when you press the hot key. So, you can give that permission in peace. If you are still sus, eh, I can't do much there champ.")
                    .font(.system(size: 11))
                    .foregroundColor(Color(red: 0.9, green: 0.4, blue: 0.4))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Sign In Button

    @ViewBuilder
    private var startButton: some View {
        VStack(spacing: 8) {
            if let error = authManager?.authError {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundColor(Color(red: 0.9, green: 0.4, blue: 0.4))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button(action: {
                authManager?.startSignIn()
            }) {
                HStack(spacing: 8) {
                    if authManager?.isAuthenticating == true {
                        ProgressView()
                            .controlSize(.small)
                            .scaleEffect(0.8)
                    }
                    Text(authManager?.isAuthenticating == true ? "Signing in..." : "Sign in to get started")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(DS.Colors.textOnAccent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.large, style: .continuous)
                        .fill(DS.Colors.accent)
                )
            }
            .buttonStyle(.plain)
            .pointerCursor()
            .disabled(authManager?.isAuthenticating == true)
            // MARK: - Skilly — Accessibility
            .accessibilityLabel(authManager?.isAuthenticating == true ? "Signing in" : "Sign in")
            .accessibilityHint("Opens browser to sign in with WorkOS")
        }
    }

    // MARK: - Onboarding Start Button

    private var onboardingStartButton: some View {
        Button(action: {
            companionManager.triggerOnboarding()
        }) {
            Text("Start")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(DS.Colors.textOnAccent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.large, style: .continuous)
                        .fill(DS.Colors.accent)
                )
        }
        .buttonStyle(.plain)
        .pointerCursor()
        // MARK: - Skilly — Accessibility
        .accessibilityLabel("Start onboarding")
        .accessibilityHint("Begins the Skilly introduction")
    }

    // MARK: - Permissions

    private var settingsSection: some View {
        VStack(spacing: 2) {
            Text("PERMISSIONS")
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundColor(DS.Colors.accentText)
                .tracking(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 6)

            microphonePermissionRow

            accessibilityPermissionRow

            screenRecordingPermissionRow

            if companionManager.hasScreenRecordingPermission {
                screenContentPermissionRow
            }

        }
    }

    private var accessibilityPermissionRow: some View {
        let isGranted = companionManager.hasAccessibilityPermission
        return HStack {
            HStack(spacing: 8) {
                Image(systemName: "hand.raised")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(isGranted ? DS.Colors.textTertiary : DS.Colors.warning)
                    .frame(width: 16)

                Text("Accessibility")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(DS.Colors.textSecondary)
            }

            Spacer()

            if isGranted {
                HStack(spacing: 4) {
                    Circle()
                        .fill(DS.Colors.success)
                        .frame(width: 6, height: 6)
                    Text("Granted")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(DS.Colors.success)
                }
            } else {
                HStack(spacing: 6) {
                    Button(action: {
                        // Triggers the system accessibility prompt (AXIsProcessTrustedWithOptions)
                        // on first attempt, then opens System Settings on subsequent attempts.
                        WindowPositionManager.requestAccessibilityPermission()
                    }) {
                        Text("Grant")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(DS.Colors.textOnAccent)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(
                                Capsule()
                                    .fill(DS.Colors.accent)
                            )
                    }
                    .buttonStyle(.plain)
                    .pointerCursor()

                    Button(action: {
                        // Reveals the app in Finder so the user can drag it into
                        // the Accessibility list if it doesn't appear automatically
                        // (common with unsigned dev builds).
                        WindowPositionManager.revealAppInFinder()
                        WindowPositionManager.openAccessibilitySettings()
                    }) {
                        Text("Find App")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(DS.Colors.textSecondary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(
                                Capsule()
                                    .stroke(DS.Colors.borderSubtle, lineWidth: 0.8)
                            )
                    }
                    .buttonStyle(.plain)
                    .pointerCursor()
                }
            }
        }
        .padding(.vertical, 6)
    }

    private var screenRecordingPermissionRow: some View {
        let isGranted = companionManager.hasScreenRecordingPermission
        return HStack {
            HStack(spacing: 8) {
                Image(systemName: "rectangle.dashed.badge.record")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(isGranted ? DS.Colors.textTertiary : DS.Colors.warning)
                    .frame(width: 16)

                VStack(alignment: .leading, spacing: 1) {
                    Text("Screen Recording")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(DS.Colors.textSecondary)

                    Text(isGranted
                         ? "Only takes a screenshot when you use the hotkey"
                         : "Quit and reopen after granting")
                        .font(.system(size: 10))
                        .foregroundColor(DS.Colors.textTertiary)
                }
            }

            Spacer()

            if isGranted {
                HStack(spacing: 4) {
                    Circle()
                        .fill(DS.Colors.success)
                        .frame(width: 6, height: 6)
                    Text("Granted")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(DS.Colors.success)
                }
            } else {
                Button(action: {
                    // Triggers the native macOS screen recording prompt on first
                    // attempt (auto-adds app to the list), then opens System Settings
                    // on subsequent attempts.
                    WindowPositionManager.requestScreenRecordingPermission()
                }) {
                    Text("Grant")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DS.Colors.textOnAccent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(DS.Colors.accent)
                        )
                }
                .buttonStyle(.plain)
                .pointerCursor()
            }
        }
        .padding(.vertical, 6)
    }

    private var screenContentPermissionRow: some View {
        let isGranted = companionManager.hasScreenContentPermission
        return HStack {
            HStack(spacing: 8) {
                Image(systemName: "eye")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(isGranted ? DS.Colors.textTertiary : DS.Colors.warning)
                    .frame(width: 16)

                Text("Screen Content")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(DS.Colors.textSecondary)
            }

            Spacer()

            if isGranted {
                HStack(spacing: 4) {
                    Circle()
                        .fill(DS.Colors.success)
                        .frame(width: 6, height: 6)
                    Text("Granted")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(DS.Colors.success)
                }
            } else {
                Button(action: {
                    companionManager.requestScreenContentPermission()
                }) {
                    Text("Grant")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DS.Colors.textOnAccent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(DS.Colors.accent)
                        )
                }
                .buttonStyle(.plain)
                .pointerCursor()
            }
        }
        .padding(.vertical, 6)
    }

    private var microphonePermissionRow: some View {
        let isGranted = companionManager.hasMicrophonePermission
        return HStack {
            HStack(spacing: 8) {
                Image(systemName: "mic")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(isGranted ? DS.Colors.textTertiary : DS.Colors.warning)
                    .frame(width: 16)

                Text("Microphone")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(DS.Colors.textSecondary)
            }

            Spacer()

            if isGranted {
                HStack(spacing: 4) {
                    Circle()
                        .fill(DS.Colors.success)
                        .frame(width: 6, height: 6)
                    Text("Granted")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(DS.Colors.success)
                }
            } else {
                Button(action: {
                    // Triggers the native macOS microphone permission dialog on
                    // first attempt. If already denied, opens System Settings.
                    let status = AVCaptureDevice.authorizationStatus(for: .audio)
                    if status == .notDetermined {
                        AVCaptureDevice.requestAccess(for: .audio) { _ in }
                    } else {
                        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone") {
                            NSWorkspace.shared.open(url)
                        }
                    }
                }) {
                    Text("Grant")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DS.Colors.textOnAccent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(DS.Colors.accent)
                        )
                }
                .buttonStyle(.plain)
                .pointerCursor()
            }
        }
        .padding(.vertical, 6)
    }

    private func permissionRow(
        label: String,
        iconName: String,
        isGranted: Bool,
        settingsURL: String
    ) -> some View {
        HStack {
            HStack(spacing: 8) {
                Image(systemName: iconName)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(isGranted ? DS.Colors.textTertiary : DS.Colors.warning)
                    .frame(width: 16)

                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(DS.Colors.textSecondary)
            }

            Spacer()

            if isGranted {
                HStack(spacing: 4) {
                    Circle()
                        .fill(DS.Colors.success)
                        .frame(width: 6, height: 6)
                    Text("Granted")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(DS.Colors.success)
                }
            } else {
                Button(action: {
                    if let url = URL(string: settingsURL) {
                        NSWorkspace.shared.open(url)
                    }
                }) {
                    Text("Grant")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DS.Colors.textOnAccent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(DS.Colors.accent)
                        )
                }
                .buttonStyle(.plain)
                .pointerCursor()
            }
        }
        .padding(.vertical, 6)
    }



    // MARK: - Skilly — Show Cursor Toggle

    private var showSkillyCursorToggleRow: some View {
        HStack {
            HStack(spacing: 8) {
                Image(systemName: "cursorarrow")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(DS.Colors.textTertiary)
                    .frame(width: 16)

                Text("Show Skilly")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(DS.Colors.textSecondary)
            }

            Spacer()

            Toggle("", isOn: Binding(
                get: { companionManager.isSkillyCursorEnabled },
                set: { companionManager.setSkillyCursorEnabled($0) }
            ))
            .toggleStyle(.switch)
            .labelsHidden()
            .tint(DS.Colors.accent)
            .scaleEffect(0.8)
        }
        .padding(.vertical, 4)
        // MARK: - Skilly — Accessibility
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Show Skilly cursor")
        .accessibilityHint("Toggle to show or hide the Skilly companion cursor")
        .accessibilityValue(companionManager.isSkillyCursorEnabled ? "On" : "Off")
    }

    // MARK: - Feedback Button

    private var dmFarzaButton: some View {
        Button(action: {
            if let url = URL(string: "https://tryskilly.app") {
                NSWorkspace.shared.open(url)
            }
        }) {
            HStack(spacing: 8) {
                Image(systemName: "bubble.left.fill")
                    .font(.system(size: 12, weight: .medium))

                VStack(alignment: .leading, spacing: 2) {
                    Text("Got feedback?")
                        .font(.system(size: 12, weight: .semibold))
                    Text("Bugs, ideas, anything — visit tryskilly.app")
                        .font(.system(size: 10))
                        .foregroundColor(DS.Colors.textTertiary)
                }
            }
            .foregroundColor(DS.Colors.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                    .fill(Color.white.opacity(0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                    .stroke(DS.Colors.borderSubtle, lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .pointerCursor()
        // MARK: - Skilly — Accessibility
        .accessibilityLabel("Feedback")
        .accessibilityHint("Opens tryskilly.app in your browser")
    }

    // MARK: - Footer

    private var footerSection: some View {
        HStack {
            Button(action: {
                NSApp.terminate(nil)
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "power")
                        .font(.system(size: 11, weight: .medium))
                    Text("Quit Skilly")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(DS.Colors.textTertiary)
            }
            .buttonStyle(.plain)
            .pointerCursor()
            // MARK: - Skilly — Accessibility
            .accessibilityLabel("Quit Skilly")
            .accessibilityHint("Exits the application")

            if companionManager.hasCompletedOnboarding {
                Spacer()

                Button(action: {
                    companionManager.replayOnboarding()
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "play.circle")
                            .font(.system(size: 11, weight: .medium))
                        Text("Replay Intro")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(DS.Colors.textTertiary)
                }
                .buttonStyle(.plain)
                .pointerCursor()
                // MARK: - Skilly — Accessibility
                .accessibilityLabel("Replay intro")
                .accessibilityHint("Replays the Skilly introduction")
            }

            if authManager?.isSignedIn == true {
                Spacer()

                Button(action: {
                    authManager?.signOut()
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 11, weight: .medium))
                        Text("Sign Out")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(DS.Colors.textTertiary)
                }
                .buttonStyle(.plain)
                .pointerCursor()
                // MARK: - Skilly — Accessibility
                .accessibilityLabel("Sign out")
                .accessibilityHint("Signs out of your Skilly account")
            }

            usageStrip
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
        }
    }

    // MARK: - Visual Helpers

    private var panelBackground: some View {
        RoundedRectangle(cornerRadius: DS.CornerRadius.extraLarge, style: .continuous)
            .fill(DS.Colors.background)
            .shadow(color: Color.black.opacity(0.5), radius: 20, x: 0, y: 10)
            .shadow(color: Color.black.opacity(0.3), radius: 4, x: 0, y: 2)
    }

    private var statusDotColor: Color {
        if !companionManager.isOverlayVisible {
            return DS.Colors.textTertiary
        }
        switch companionManager.voiceState {
        case .idle:
            return DS.Colors.success
        case .listening:
            return DS.Colors.blue400
        case .processing, .responding:
            return DS.Colors.blue400
        }
    }

    private var statusText: String {
        if !companionManager.hasCompletedOnboarding || !companionManager.allPermissionsGranted {
            return "Setup"
        }
        if !companionManager.isOverlayVisible {
            return "Ready"
        }
        switch companionManager.voiceState {
        case .idle:
            return "Active"
        case .listening:
            return "Listening"
        case .processing:
            return "Processing"
        case .responding:
            return "Responding"
        }
    }

    // MARK: - Skilly — Usage Strip

    @ViewBuilder
    private var usageStrip: some View {
        let status = EntitlementManager.shared.status

        switch status {
        case .trial:
            if TrialTracker.shared.isExhausted {
                trialExhaustedStrip
            } else {
                trialActiveStrip
            }

        case .active:
            if UsageTracker.shared.isOverCap {
                capReachedStrip
            } else {
                subscribedStrip
            }

        case .canceled(let accessUntil):
            if accessUntil > Date() {
                if UsageTracker.shared.isOverCap {
                    capReachedStrip
                } else {
                    subscribedStrip
                }
            } else {
                trialExhaustedStrip
            }

        case .none, .expired:
            trialExhaustedStrip
        }
    }

    private var trialActiveStrip: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Trial: \(formatTime(Int(TrialTracker.shared.remainingSeconds))) remaining")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(DS.Colors.textSecondary)
                Spacer()
            }
            GeometryReader { geometry in
                let progress = max(0, min(1, TrialTracker.shared.remainingSeconds / 900))
                RoundedRectangle(cornerRadius: 2)
                    .fill(DS.Colors.blue400)
                    .frame(width: geometry.size.width * progress, height: 4)
            }
            .frame(height: 4)
        }
        .frame(height: 32)
    }

    private var trialExhaustedStrip: some View {
        Button(action: {
            Task { await EntitlementManager.shared.startCheckout() }
        }) {
            HStack {
                Image(systemName: "clock.badge.exclamationmark")
                    .font(.system(size: 11, weight: .medium))
                Text("Trial ended — Subscribe to continue")
                    .font(.system(size: 12, weight: .medium))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .medium))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
                    .background(DS.Colors.destructive.opacity(0.15))
            .cornerRadius(DS.CornerRadius.medium)
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .frame(height: 32)
    }

    private var subscribedStrip: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                let usedSeconds = Int(UsageTracker.shared.secondsUsed)
                let totalSeconds = 3 * 60 * 60
                Text("Using \(formatTime(usedSeconds)) of 3h")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(DS.Colors.textSecondary)
                Spacer()
                if UsageTracker.shared.usageProgress >= 0.8 {
                    Text("80%+ of limit")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(DS.Colors.warning)
                }
            }
            GeometryReader { geometry in
                let progress = max(0.0, min(1.0, UsageTracker.shared.usageProgress))
                RoundedRectangle(cornerRadius: 2)
                    .fill(UsageTracker.shared.usageProgress >= 0.8 ? DS.Colors.warning : DS.Colors.blue400)
                    .frame(width: geometry.size.width * progress, height: 4)
            }
            .frame(height: 4)
        }
        .frame(height: 32)
    }

    private var capReachedStrip: some View {
        Button(action: {
            Task { await EntitlementManager.shared.startCheckout() }
        }) {
            HStack {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 11, weight: .medium))
                Text("Limit reached — Upgrade plan")
                    .font(.system(size: 12, weight: .medium))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .medium))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
                    .background(DS.Colors.destructive.opacity(0.15))
            .cornerRadius(DS.CornerRadius.medium)
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .frame(height: 32)
    }

    private func formatTime(_ seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        } else {
            return "\(minutes)m"
        }
    }

}
