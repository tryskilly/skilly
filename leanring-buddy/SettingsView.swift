// MARK: - Skilly
//
//  SettingsView.swift
//  leanring-buddy
//
//  Settings panel for Skilly — accessible from the menu bar panel.
//  Covers language, shortcuts, voice, and pipeline selection.
//

import SwiftUI

struct SettingsView: View {
    @ObservedObject var settings: AppSettings
    @Environment(\.dismiss) private var dismiss
    @State private var isRecordingCancelKey = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Settings")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(DS.Colors.textPrimary)

                Spacer()

                Button(action: { dismiss() }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(DS.Colors.textTertiary)
                }
                .buttonStyle(.plain)
                .pointerCursor()
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 12)

            Divider()
                .background(DS.Colors.borderSubtle)
                .padding(.horizontal, 16)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    languageSection
                    shortcutsSection
                    voiceSection
                    pipelineSection
                }
                .padding(16)
            }
        }
        .frame(width: 320, height: 420)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(DS.Colors.background)
        )
    }

    // MARK: - Language Section

    private var languageSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("LANGUAGE")

            HStack {
                Text("Preferred language")
                    .font(.system(size: 12))
                    .foregroundColor(DS.Colors.textSecondary)

                Spacer()

                Picker("", selection: $settings.preferredLanguage) {
                    ForEach(AppSettings.supportedLanguages, id: \.code) { language in
                        Text(language.name).tag(language.code)
                    }
                }
                .pickerStyle(.menu)
                .frame(width: 130)
            }

            Toggle(isOn: $settings.autoDetectLanguage) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Auto-detect language")
                        .font(.system(size: 12))
                        .foregroundColor(DS.Colors.textSecondary)
                    Text("Detect from your speech. Falls back to preferred language.")
                        .font(.system(size: 10))
                        .foregroundColor(DS.Colors.textTertiary)
                }
            }
            .toggleStyle(.switch)
            .controlSize(.small)
        }
    }

    // MARK: - Shortcuts Section

    private var shortcutsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("SHORTCUTS")

            HStack {
                Text("Push to talk")
                    .font(.system(size: 12))
                    .foregroundColor(DS.Colors.textSecondary)

                Spacer()

                Picker("", selection: $settings.pushToTalkShortcut) {
                    Text("Ctrl + Option").tag("controlOption")
                    Text("Shift + Ctrl").tag("shiftControl")
                    Text("Shift + Fn").tag("shiftFunction")
                    Text("Ctrl + Option + Space").tag("controlOptionSpace")
                }
                .pickerStyle(.menu)
                .frame(width: 160)
            }

            HStack {
                Text("Cancel / Stop")
                    .font(.system(size: 12))
                    .foregroundColor(DS.Colors.textSecondary)

                Spacer()

                if isRecordingCancelKey {
                    Text("Press a key...")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(DS.Colors.accent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                                .stroke(DS.Colors.accent, lineWidth: 1)
                        )
                } else {
                    Button(action: { isRecordingCancelKey = true }) {
                        Text(settings.cancelKeyDisplayName)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(DS.Colors.textSecondary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(
                                RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                                    .fill(Color.white.opacity(0.08))
                            )
                    }
                    .buttonStyle(.plain)
                    .pointerCursor()
                }
            }
            .onKeyPress { keyPress in
                if isRecordingCancelKey {
                    // Map SwiftUI KeyEquivalent to keyCode
                    if keyPress.key == .escape {
                        settings.cancelKeyCode = 53
                    } else if keyPress.key == .delete {
                        settings.cancelKeyCode = 51
                    }
                    isRecordingCancelKey = false
                    return .handled
                }
                return .ignored
            }
        }
    }

    // MARK: - Voice Section

    private var voiceSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("VOICE")

            HStack {
                Text("AI Voice")
                    .font(.system(size: 12))
                    .foregroundColor(DS.Colors.textSecondary)

                Spacer()

                Picker("", selection: $settings.voiceName) {
                    ForEach(OpenAIRealtimeClient.availableVoices, id: \.self) { voice in
                        Text(voice.capitalized).tag(voice)
                    }
                }
                .pickerStyle(.menu)
                .frame(width: 130)
            }
        }
    }

    // MARK: - Pipeline Section

    private var pipelineSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("AI ENGINE")

            Picker("", selection: $settings.useRealtimePipeline) {
                Text("OpenAI Realtime").tag(true)
                Text("Classic (Claude + ElevenLabs)").tag(false)
            }
            .pickerStyle(.segmented)

            if settings.useRealtimePipeline {
                Text("Audio + screenshots + AI in one connection. Fastest response.")
                    .font(.system(size: 10))
                    .foregroundColor(DS.Colors.textTertiary)
            } else {
                Text("AssemblyAI (STT) → Claude (AI) → ElevenLabs (TTS). Best teaching quality.")
                    .font(.system(size: 10))
                    .foregroundColor(DS.Colors.textTertiary)
            }
        }
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .foregroundColor(DS.Colors.textTertiary)
    }
}
