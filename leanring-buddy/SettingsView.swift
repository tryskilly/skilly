// MARK: - Skilly
//
//  SettingsView.swift
//  leanring-buddy
//
//  Settings panel for Skilly — opens as a popover from the gear icon.
//  Three tabs: Account, Voice, General. Account handles auth, privacy,
//  and subscription. Voice handles language/shortcuts/voice config.
//  General handles skills auto-load, startup, and help.
//

import SwiftUI

struct SettingsView: View {
    @ObservedObject var settings: AppSettings
    var skillManager: SkillManager?
    var authManager: AuthManager?
    var companionManager: CompanionManager?

    enum Tab: String, CaseIterable {
        case account = "Account"
        case voice = "Voice"
        case general = "General"

        var icon: String {
            switch self {
            case .account: return "person.circle"
            case .voice: return "waveform"
            case .general: return "gearshape"
            }
        }
    }

    @State private var selectedTab: Tab = .account

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            tabBar

            Divider()
                .background(DS.Colors.borderSubtle)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch selectedTab {
                    case .account: accountContent
                    case .voice: voiceContent
                    case .general: generalContent
                    }
                }
                .padding(16)
            }
            .frame(maxHeight: 420)
        }
        .frame(width: 300)
        .background(DS.Colors.background)
        .preferredColorScheme(.dark)
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(Tab.allCases, id: \.self) { tab in
                Button(action: { selectedTab = tab }) {
                    VStack(spacing: 4) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 13, weight: .medium))
                        Text(tab.rawValue)
                            .font(.system(size: 10, weight: .semibold, design: .rounded))
                            .tracking(0.4)
                    }
                    .foregroundColor(selectedTab == tab ? DS.Colors.accentText : DS.Colors.textTertiary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(
                        Rectangle()
                            .fill(selectedTab == tab ? DS.Colors.accent.opacity(0.08) : Color.clear)
                    )
                    .overlay(
                        Rectangle()
                            .fill(selectedTab == tab ? DS.Colors.accent : Color.clear)
                            .frame(height: 2)
                            .frame(maxHeight: .infinity, alignment: .bottom)
                    )
                }
                .buttonStyle(.plain)
                .pointerCursor()
            }
        }
    }

    // MARK: - Account Tab

    @ViewBuilder
    private var accountContent: some View {
        if let user = authManager?.currentUser {
            userCard(user: user)
        } else {
            sectionHeader("SIGN IN")
            Text("Sign in to sync progress and access skills across devices.")
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textTertiary)
                .fixedSize(horizontal: false, vertical: true)
        }

        divider

        sectionHeader("SUBSCRIPTION")
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Free trial")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(DS.Colors.textPrimary)
                Spacer()
                Text("15 min lifetime")
                    .font(.system(size: 11))
                    .foregroundColor(DS.Colors.textTertiary)
            }
            Text("Upgrade for unlimited usage and priority access.")
                .font(.system(size: 10))
                .foregroundColor(DS.Colors.textTertiary)
                .fixedSize(horizontal: false, vertical: true)
        }

        divider

        sectionHeader("DATA & PRIVACY")
        toggleRow(
            title: "Share anonymous analytics",
            subtitle: "Processed by PostHog. No audio, screenshots, or prompts ever recorded.",
            isOn: Binding(
                get: { settings.analyticsEnabled },
                set: { settings.analyticsEnabled = $0 }
            )
        )
    }

    private func userCard(user: SkillyUser) -> some View {
        HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(DS.Colors.accentSubtle)
                    .frame(width: 34, height: 34)
                Text(String(user.displayName.prefix(1)).uppercased())
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(DS.Colors.accentText)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(user.displayName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(DS.Colors.textPrimary)
                    .lineLimit(1)
                Text(user.email)
                    .font(.system(size: 11))
                    .foregroundColor(DS.Colors.textTertiary)
                    .lineLimit(1)
            }

            Spacer()

            Button(action: { authManager?.signOut() }) {
                Text("Sign out")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(DS.Colors.destructiveText)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                            .fill(DS.Colors.destructive.opacity(0.12))
                    )
            }
            .buttonStyle(.plain)
            .pointerCursor()
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                .fill(Color.white.opacity(0.04))
        )
    }

    // MARK: - Voice Tab

    @ViewBuilder
    private var voiceContent: some View {
        sectionHeader("VOICE")
        settingsRow("AI Voice") {
            settingsPicker(
                selection: $settings.voiceName,
                options: OpenAIRealtimeClient.availableVoices.map { ($0, $0.capitalized) }
            )
        }

        divider

        sectionHeader("LANGUAGE")
        settingsRow("Preferred language") {
            settingsPicker(
                selection: $settings.preferredLanguage,
                options: AppSettings.supportedLanguages.map { ($0.code, $0.name) }
            )
        }

        toggleRow(
            title: "Auto-detect language",
            subtitle: "Detect from speech, fall back to preferred language.",
            isOn: $settings.autoDetectLanguage
        )

        divider

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
    }

    // MARK: - General Tab

    @ViewBuilder
    private var generalContent: some View {
        if let skillManager {
            sectionHeader("SKILLS")
            toggleRow(
                title: "Auto-activate by app",
                subtitle: "Activate matching skill when I switch apps.",
                isOn: Binding(
                    get: { skillManager.autoDetectionEnabled },
                    set: { skillManager.setAutoDetectionEnabled($0) }
                )
            )

            if let frontmostAppBundleId = skillManager.frontmostAppBundleId, !frontmostAppBundleId.isEmpty {
                Text("Detected app: \(frontmostAppBundleId)")
                    .font(.system(size: 10))
                    .foregroundColor(DS.Colors.textTertiary)
            }

            divider
        }

        sectionHeader("HELP")
        VStack(spacing: 4) {
            helpRow(label: "Replay intro", icon: "play.circle") {
                companionManager?.replayOnboarding()
            }
            helpRow(label: "Send feedback", icon: "bubble.left") {
                if let url = URL(string: "https://tryskilly.app") {
                    NSWorkspace.shared.open(url)
                }
            }
            helpRow(label: "About Skilly", icon: "info.circle") {
                if let url = URL(string: "https://tryskilly.app") {
                    NSWorkspace.shared.open(url)
                }
            }
        }

        divider

        sectionHeader("APP")
        HStack {
            Text("Version")
                .font(.system(size: 12))
                .foregroundColor(DS.Colors.textSecondary)
            Spacer()
            Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textTertiary)
        }

        Button(action: { NSApp.terminate(nil) }) {
            HStack {
                Image(systemName: "power")
                    .font(.system(size: 11))
                Text("Quit Skilly")
                    .font(.system(size: 12, weight: .medium))
                Spacer()
                Text("⌘Q")
                    .font(.system(size: 10))
                    .foregroundColor(DS.Colors.textTertiary)
            }
            .foregroundColor(DS.Colors.textSecondary)
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                    .fill(Color.white.opacity(0.04))
            )
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .padding(.top, 4)
    }

    private func helpRow(label: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 11))
                    .foregroundColor(DS.Colors.textTertiary)
                    .frame(width: 14)
                Text(label)
                    .font(.system(size: 12))
                    .foregroundColor(DS.Colors.textSecondary)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 9))
                    .foregroundColor(DS.Colors.textTertiary)
            }
            .padding(.vertical, 7)
            .padding(.horizontal, 10)
            .background(
                RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                    .fill(Color.white.opacity(0.03))
            )
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    // MARK: - Components

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .foregroundColor(DS.Colors.accentText)
            .tracking(0.8)
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.08))
            .frame(height: 1)
            .padding(.vertical, 4)
    }

    private func settingsRow<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 12))
                .foregroundColor(DS.Colors.textSecondary)
            Spacer()
            content()
        }
    }

    private func toggleRow(title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 12))
                    .foregroundColor(DS.Colors.textSecondary)
                Text(subtitle)
                    .font(.system(size: 10))
                    .foregroundColor(DS.Colors.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            Toggle("", isOn: isOn)
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.small)
                .tint(DS.Colors.accent)
        }
    }

    private func settingsPicker(selection: Binding<String>, options: [(value: String, label: String)]) -> some View {
        Picker("", selection: selection) {
            ForEach(options, id: \.value) { option in
                Text(option.label).tag(option.value)
            }
        }
        .labelsHidden()
        .pickerStyle(.menu)
        .tint(DS.Colors.textPrimary)
        .fixedSize()
    }

    private func keyBadge(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .medium, design: .rounded))
            .foregroundColor(DS.Colors.textPrimary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color.white.opacity(0.1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(Color.white.opacity(0.15), lineWidth: 0.5)
            )
    }
}
