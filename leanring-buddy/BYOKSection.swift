// MARK: - Skilly
//
//  BYOKSection.swift
//  leanring-buddy
//
//  Settings section for Bring-Your-Own-Key (BYOK). When the user pastes
//  a valid OpenAI API key, the app bypasses the Skilly worker relay and
//  mints Realtime sessions directly against api.openai.com. The user is
//  billed by OpenAI; Skilly's 15-minute trial gating is bypassed.
//
//  The key is validated against GET /v1/models before saving so users
//  don't paste a typo and discover the problem on the next push-to-talk.
//

import AppKit
import SwiftUI

struct BYOKSection: View {
    @ObservedObject var settings: AppSettings

    @State private var draftKey: String = ""
    @State private var isRevealed: Bool = false
    @State private var status: Status = .idle
    @State private var planStatus: PlanStatus = .idle

    enum Status: Equatable {
        case idle
        case validating
        case saved
        case error(String)
    }

    enum PlanStatus: Equatable {
        case idle
        case opening
        case opened
        case error(String)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if settings.hasOwnAPIKey && status != .validating {
                activeStateRow
                platformPlanRow
            } else {
                inputRow
            }

            statusRow
            planStatusRow

            helperText
        }
        .onAppear {
            // Prefill the field with the existing key so the user can see
            // (when toggled) and edit. Keep it empty when nothing is saved.
            draftKey = settings.openAIAPIKey
        }
    }

    // MARK: - Subviews

    private var activeStateRow: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 12))
                .foregroundColor(DS.Colors.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text("Using your own OpenAI key")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(DS.Colors.textPrimary)
                Text(maskedKey(settings.openAIAPIKey))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(DS.Colors.textTertiary)
            }
            Spacer()
            Button(action: clearKey) {
                Text("Remove")
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

    private var inputRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Group {
                    if isRevealed {
                        TextField("sk-proj-...", text: $draftKey)
                    } else {
                        SecureField("sk-proj-...", text: $draftKey)
                    }
                }
                .textFieldStyle(.plain)
                .font(.system(size: 11, design: .monospaced))
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                        .fill(Color.white.opacity(0.06))
                )

                Button(action: { isRevealed.toggle() }) {
                    Image(systemName: isRevealed ? "eye.slash" : "eye")
                        .font(.system(size: 11))
                        .foregroundColor(DS.Colors.textTertiary)
                        .padding(6)
                }
                .buttonStyle(.plain)
                .pointerCursor()
            }

            Button(action: saveKey) {
                HStack(spacing: 4) {
                    if status == .validating {
                        ProgressView()
                            .controlSize(.mini)
                            .scaleEffect(0.7)
                    }
                    Text(status == .validating ? "Verifying…" : "Verify & save")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(DS.Colors.accentText)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                        .fill(DS.Colors.accentSubtle)
                )
            }
            .buttonStyle(.plain)
            .pointerCursor()
            .disabled(draftKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || status == .validating)
        }
    }

    private var platformPlanRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "creditcard")
                    .font(.system(size: 12))
                    .foregroundColor(DS.Colors.accentText)
                VStack(alignment: .leading, spacing: 2) {
                    Text("BYOK platform plan")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(DS.Colors.textPrimary)
                    Text("Keep Skilly account features and usage telemetry active while OpenAI bills your key directly.")
                        .font(.system(size: 10))
                        .foregroundColor(DS.Colors.textTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
            }

            Button(action: openBYOKCheckout) {
                HStack(spacing: 5) {
                    if planStatus == .opening {
                        ProgressView()
                            .controlSize(.mini)
                            .scaleEffect(0.7)
                    } else {
                        Image(systemName: "arrow.up.right.square")
                            .font(.system(size: 10, weight: .medium))
                    }
                    Text(planStatus == .opening ? "Opening…" : "Activate plan")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(DS.Colors.textOnAccent)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                        .fill(DS.Colors.accent)
                )
            }
            .buttonStyle(.plain)
            .pointerCursor()
            .disabled(planStatus == .opening)

            #if DEBUG
            Toggle("Require BYOK plan before use", isOn: $settings.requireBYOKSubscription)
                .font(.system(size: 10))
                .foregroundColor(DS.Colors.textTertiary)
                .toggleStyle(.checkbox)
            #endif
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                .fill(Color.white.opacity(0.035))
        )
    }

    @ViewBuilder
    private var statusRow: some View {
        switch status {
        case .idle, .validating:
            EmptyView()
        case .saved:
            HStack(spacing: 4) {
                Image(systemName: "checkmark")
                    .font(.system(size: 9))
                Text("Key verified — Skilly will use it for all Realtime sessions.")
                    .font(.system(size: 10))
            }
            .foregroundColor(DS.Colors.accent)
        case .error(let message):
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 9))
                Text(message)
                    .font(.system(size: 10))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundColor(DS.Colors.destructiveText)
        }
    }

    @ViewBuilder
    private var planStatusRow: some View {
        switch planStatus {
        case .idle, .opening:
            EmptyView()
        case .opened:
            HStack(spacing: 4) {
                Image(systemName: "checkmark")
                    .font(.system(size: 9))
                Text("Checkout opened in your browser.")
                    .font(.system(size: 10))
            }
            .foregroundColor(DS.Colors.accent)
        case .error(let message):
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 9))
                Text(message)
                    .font(.system(size: 10))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundColor(DS.Colors.destructiveText)
        }
    }

    private var helperText: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Paste your OpenAI API key to use your own OpenAI billing for Realtime voice. Skilly still records usage totals for account support and abuse monitoring.")
                .font(.system(size: 10))
                .foregroundColor(DS.Colors.textTertiary)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: openOpenAIKeysPage) {
                HStack(spacing: 3) {
                    Text("Get a key at platform.openai.com/api-keys")
                        .font(.system(size: 10, weight: .medium))
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 8))
                }
                .foregroundColor(DS.Colors.accentText)
            }
            .buttonStyle(.plain)
            .pointerCursor()
        }
    }

    // MARK: - Actions

    private func saveKey() {
        let trimmed = draftKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        status = .validating
        planStatus = .idle

        Task {
            let result = await BYOKValidator.validate(key: trimmed)
            await MainActor.run {
                switch result {
                case .success:
                    settings.openAIAPIKey = trimmed
                    status = .saved
                case .failure(let message):
                    status = .error(message)
                }
            }
        }
    }

    private func clearKey() {
        settings.openAIAPIKey = ""
        draftKey = ""
        status = .idle
        planStatus = .idle
    }

    private func openBYOKCheckout() {
        planStatus = .opening
        Task {
            let didOpen = await EntitlementManager.shared.startBYOKCheckout()
            await MainActor.run {
                planStatus = didOpen
                    ? .opened
                    : .error("Could not open checkout. Make sure you're signed in and try again.")
            }
        }
    }

    private func openOpenAIKeysPage() {
        if let url = URL(string: "https://platform.openai.com/api-keys") {
            NSWorkspace.shared.open(url)
        }
    }

    private func maskedKey(_ key: String) -> String {
        guard key.count > 8 else { return String(repeating: "•", count: key.count) }
        let prefix = key.prefix(7)
        let suffix = key.suffix(4)
        return "\(prefix)…\(suffix)"
    }
}

// MARK: - Validator

/// Validates an OpenAI API key with a cheap GET /v1/models call.
/// Returns success only on HTTP 200. 401 → invalid key. Other → network/server.
enum BYOKValidator {
    enum Outcome {
        case success
        case failure(String)
    }

    static func validate(key: String) async -> Outcome {
        guard let url = URL(string: "https://api.openai.com/v1/models") else {
            return .failure("Could not build the validation URL.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 10

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            switch status {
            case 200:
                return .success
            case 401:
                return .failure("OpenAI rejected this key. Double-check it on platform.openai.com/api-keys.")
            case 429:
                return .failure("Rate-limited by OpenAI. Try again in a few seconds.")
            default:
                return .failure("OpenAI returned HTTP \(status). Try again or check your account.")
            }
        } catch {
            return .failure("Network error while contacting OpenAI: \(error.localizedDescription)")
        }
    }
}
