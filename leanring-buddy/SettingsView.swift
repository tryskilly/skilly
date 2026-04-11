// MARK: - Skilly
//
//  SettingsView.swift
//  leanring-buddy
//
//  Settings panel for Skilly — opens as a popover from the gear icon.
//

import SwiftUI

struct SettingsView: View {
    @ObservedObject var settings: AppSettings
    var skillManager: SkillManager?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {

            // ── Language ──────────────────────────────
            VStack(alignment: .leading, spacing: 10) {
                sectionHeader("LANGUAGE")

                settingsRow("Preferred language") {
                    settingsPicker(
                        selection: $settings.preferredLanguage,
                        options: AppSettings.supportedLanguages.map { ($0.code, $0.name) }
                    )
                }

                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Auto-detect")
                            .font(.system(size: 12))
                            .foregroundColor(DS.Colors.textSecondary)
                        Text("Detect from speech")
                            .font(.system(size: 10))
                            .foregroundColor(DS.Colors.textTertiary)
                    }
                    Spacer()
                    Toggle("", isOn: $settings.autoDetectLanguage)
                        .labelsHidden()
                        .toggleStyle(.switch)
                        .controlSize(.small)
                }
            }

            divider

            // ── Shortcuts ─────────────────────────────
            VStack(alignment: .leading, spacing: 10) {
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

            divider

            // ── Voice ─────────────────────────────────
            VStack(alignment: .leading, spacing: 10) {
                sectionHeader("VOICE")

                settingsRow("AI Voice") {
                    settingsPicker(
                        selection: $settings.voiceName,
                        options: OpenAIRealtimeClient.availableVoices.map { ($0, $0.capitalized) }
                    )
                }
            }

            if let skillManager {
                divider

                VStack(alignment: .leading, spacing: 10) {
                    sectionHeader("SKILLS")

                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Auto-load by app")
                                .font(.system(size: 12))
                                .foregroundColor(DS.Colors.textSecondary)
                            Text("Activate matching skill automatically")
                                .font(.system(size: 10))
                                .foregroundColor(DS.Colors.textTertiary)
                        }
                        Spacer()
                        Toggle(
                            "",
                            isOn: Binding(
                                get: { skillManager.autoDetectionEnabled },
                                set: { skillManager.setAutoDetectionEnabled($0) }
                            )
                        )
                        .labelsHidden()
                        .toggleStyle(.switch)
                        .controlSize(.small)
                    }

                    if let frontmostAppBundleId = skillManager.frontmostAppBundleId, !frontmostAppBundleId.isEmpty {
                        Text("Current app: \(frontmostAppBundleId)")
                            .font(.system(size: 10))
                            .foregroundColor(DS.Colors.textTertiary)
                    } else {
                        Text("Current app: unavailable")
                            .font(.system(size: 10))
                            .foregroundColor(DS.Colors.textTertiary)
                    }
                }
            }

            divider

            VStack(alignment: .leading, spacing: 10) {
                sectionHeader("BETA TELEMETRY")

                Toggle(
                    "",
                    isOn: $settings.beta_terms_consent
                )
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.small)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Share usage analytics")
                        .font(.system(size: 12))
                        .foregroundColor(DS.Colors.textSecondary)
                    Text("Analytics processed by PostHog. No audio, screenshots, or prompts are ever recorded.")
                        .font(.system(size: 10))
                        .foregroundColor(DS.Colors.textTertiary)
                }
            }
        }
        .padding(16)
        .frame(width: 280)
        .background(DS.Colors.background)
        .preferredColorScheme(.dark)
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

    /// A dropdown picker styled for the dark settings panel.
    /// Shows the current selection as a pill with a chevron.
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

    /// A non-interactive key badge (e.g., "Escape").
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
