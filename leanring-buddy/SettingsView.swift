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

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {

            // ── Language ──────────────────────────────
            VStack(alignment: .leading, spacing: 10) {
                Text("LANGUAGE")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(DS.Colors.textTertiary)

                VStack(spacing: 8) {
                    settingsRow("Preferred language") {
                        Picker("", selection: $settings.preferredLanguage) {
                            ForEach(AppSettings.supportedLanguages, id: \.code) { lang in
                                Text(lang.name).tag(lang.code)
                            }
                        }
                        .labelsHidden()
                        .fixedSize()
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
            }

            Divider().background(DS.Colors.borderSubtle)

            // ── Shortcuts ─────────────────────────────
            VStack(alignment: .leading, spacing: 10) {
                Text("SHORTCUTS")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(DS.Colors.textTertiary)

                VStack(spacing: 8) {
                    settingsRow("Push to talk") {
                        Picker("", selection: $settings.pushToTalkShortcut) {
                            Text("Ctrl + Option").tag("controlOption")
                            Text("Shift + Ctrl").tag("shiftControl")
                            Text("Shift + Fn").tag("shiftFunction")
                        }
                        .labelsHidden()
                        .fixedSize()
                    }

                    settingsRow("Cancel / Stop") {
                        Text(settings.cancelKeyDisplayName)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(DS.Colors.textSecondary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .fill(Color.white.opacity(0.08))
                            )
                    }
                }
            }

            Divider().background(DS.Colors.borderSubtle)

            // ── Voice ─────────────────────────────────
            VStack(alignment: .leading, spacing: 10) {
                Text("VOICE")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(DS.Colors.textTertiary)

                settingsRow("AI Voice") {
                    Picker("", selection: $settings.voiceName) {
                        ForEach(OpenAIRealtimeClient.availableVoices, id: \.self) { voice in
                            Text(voice.capitalized).tag(voice)
                        }
                    }
                    .labelsHidden()
                    .fixedSize()
                }
            }
        }
        .padding(16)
        .frame(width: 280)
        .background(DS.Colors.background)
    }

    // MARK: - Helpers

    private func settingsRow<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 12))
                .foregroundColor(DS.Colors.textSecondary)
            Spacer()
            content()
        }
    }
}
