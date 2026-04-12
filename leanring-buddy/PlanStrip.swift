// MARK: - Skilly
//
//  PlanStrip.swift
//  leanring-buddy
//
//  Compact plan-state strip shown at the top of the Skilly panel.
//  Always visible. Styled contextually: subtle in healthy states
//  (TRIAL, ACTIVE), visually weighted in alert states (LOW, EMPTY, ENDED).
//
//  Observes TrialTracker + UsageTracker + EntitlementManager so it
//  refreshes automatically after each turn records usage.
//

import SwiftUI

struct PlanStrip: View {
    @ObservedObject var trialTracker: TrialTracker = .shared
    @ObservedObject var usageTracker: UsageTracker = .shared
    @ObservedObject var entitlementManager: EntitlementManager = .shared

    // MARK: - State Resolution

    enum PlanState {
        case trial(remainingSeconds: TimeInterval, progress: Double)
        case active(remainingSeconds: TimeInterval, progress: Double, resetsAt: Date?)
        case low(remainingSeconds: TimeInterval, resetsAt: Date?)
        case empty(resetsAt: Date?)
        case trialEnded
        case none
    }

    private var state: PlanState {
        // Fall back to trial when no entitlement is set yet (new user,
        // offline, or Worker hasn't synced). This matches the PlanCard.
        let effectiveStatus: EntitlementStatus
        if case .none = entitlementManager.status {
            effectiveStatus = .trial(remainingSeconds: trialTracker.remainingSeconds)
        } else {
            effectiveStatus = entitlementManager.status
        }

        switch effectiveStatus {
        case .trial:
            if trialTracker.isExhausted {
                return .trialEnded
            }
            return .trial(
                remainingSeconds: trialTracker.remainingSeconds,
                progress: trialTracker.usageProgress
            )

        case .active, .canceled:
            if usageTracker.isOverCap {
                return .empty(resetsAt: usageTracker.periodEnd)
            }
            let remaining = usageTracker.remainingSeconds
            let progress = usageTracker.usageProgress
            if progress >= 0.8 {
                return .low(remainingSeconds: remaining, resetsAt: usageTracker.periodEnd)
            }
            return .active(
                remainingSeconds: remaining,
                progress: progress,
                resetsAt: usageTracker.periodEnd
            )

        case .expired:
            return .trialEnded

        case .none:
            return .none
        }
    }

    var body: some View {
        switch state {
        case .none:
            EmptyView()

        case .trial(let remainingSeconds, let progress):
            trialStrip(remainingSeconds: remainingSeconds, progress: progress)

        case .active(let remainingSeconds, let progress, let resetsAt):
            activeStrip(remainingSeconds: remainingSeconds, progress: progress, resetsAt: resetsAt)

        case .low(let remainingSeconds, let resetsAt):
            lowStrip(remainingSeconds: remainingSeconds, resetsAt: resetsAt)

        case .empty(let resetsAt):
            emptyStrip(resetsAt: resetsAt)

        case .trialEnded:
            trialEndedStrip
        }
    }

    // MARK: - Healthy States (subtle)

    private func trialStrip(remainingSeconds: TimeInterval, progress: Double) -> some View {
        compactStrip(
            label: "TRIAL",
            labelColor: Color(hex: "#60A5FA"),  // Blue 400 — trial signal
            detail: "\(formatRemaining(remainingSeconds)) left",
            progress: progress,
            progressColor: Color(hex: "#60A5FA")
        )
    }

    private func activeStrip(remainingSeconds: TimeInterval, progress: Double, resetsAt: Date?) -> some View {
        let resetText = resetsAt.map { " · Resets \(formatResetDate($0))" } ?? ""
        return compactStrip(
            label: "ACTIVE",
            labelColor: DS.Colors.success,
            detail: "\(formatRemaining(remainingSeconds)) left\(resetText)",
            progress: progress,
            progressColor: DS.Colors.success
        )
    }

    private func compactStrip(
        label: String,
        labelColor: Color,
        detail: String,
        progress: Double,
        progressColor: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(label)
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .tracking(0.5)
                    .foregroundColor(labelColor)

                Spacer()

                Text(detail)
                    .font(.system(size: 10))
                    .foregroundColor(DS.Colors.textTertiary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(Color.white.opacity(0.08))
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(progressColor)
                        .frame(width: geometry.size.width * max(0, min(1, progress)))
                }
            }
            .frame(height: 3)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .fill(Color.white.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 0.5)
        )
    }

    // MARK: - Alert States (visually weighted)

    private func lowStrip(remainingSeconds: TimeInterval, resetsAt: Date?) -> some View {
        let resetText = resetsAt.map { "Resets \(formatResetDate($0))" } ?? ""
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("LOW")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .tracking(0.5)
                    .foregroundColor(DS.Colors.warning)
                Text("\(formatRemaining(remainingSeconds)) left this month")
                    .font(.system(size: 10))
                    .foregroundColor(DS.Colors.textSecondary)
                if !resetText.isEmpty {
                    Text(resetText)
                        .font(.system(size: 9))
                        .foregroundColor(DS.Colors.textTertiary)
                }
            }

            Spacer()

            upgradeButton
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .fill(DS.Colors.warning.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .stroke(DS.Colors.warning.opacity(0.35), lineWidth: 0.5)
        )
    }

    private func emptyStrip(resetsAt: Date?) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("OUT OF TIME")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .tracking(0.5)
                    .foregroundColor(DS.Colors.destructiveText)
                if let resetsAt {
                    Text("Resets \(formatResetDate(resetsAt))")
                        .font(.system(size: 10))
                        .foregroundColor(DS.Colors.textSecondary)
                }
            }

            Spacer()

            upgradeButton
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .fill(DS.Colors.destructive.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .stroke(DS.Colors.destructive.opacity(0.4), lineWidth: 0.5)
        )
    }

    private var trialEndedStrip: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("TRIAL ENDED")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .tracking(0.5)
                    .foregroundColor(DS.Colors.textPrimary)
                Text("Subscribe to keep learning")
                    .font(.system(size: 10))
                    .foregroundColor(DS.Colors.textSecondary)
            }

            Spacer()

            upgradeButton
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .fill(DS.Colors.accent.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .stroke(DS.Colors.accent.opacity(0.4), lineWidth: 0.5)
        )
    }

    // MARK: - Components

    private var upgradeButton: some View {
        Button(action: {
            Task { await EntitlementManager.shared.startCheckout() }
        }) {
            HStack(spacing: 3) {
                Text("Upgrade")
                    .font(.system(size: 10, weight: .semibold))
                Image(systemName: "arrow.right")
                    .font(.system(size: 8, weight: .bold))
            }
            .foregroundColor(DS.Colors.textOnAccent)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(DS.Colors.accent)
            )
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    // MARK: - Formatting

    private func formatRemaining(_ seconds: TimeInterval) -> String {
        let totalSeconds = Int(max(0, seconds))
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let secs = totalSeconds % 60

        if hours > 0 {
            return "\(hours)h \(minutes)m"
        } else if minutes > 0 {
            if seconds < 60 {
                return "\(secs)s"
            }
            return "\(minutes)m \(secs)s"
        } else {
            return "\(secs)s"
        }
    }

    private func formatResetDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }
}
