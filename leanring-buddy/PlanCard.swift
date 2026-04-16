// MARK: - Skilly
//
//  PlanCard.swift
//  leanring-buddy
//
//  Detailed plan card shown in Settings → Account. Shows status,
//  time consumed this month, progress bar, reset date, and a
//  "Manage subscription" button. Matches the Skilly design spec.
//

import SwiftUI

struct PlanCard: View {
    @ObservedObject var trialTracker: TrialTracker = .shared
    @ObservedObject var usageTracker: UsageTracker = .shared
    @ObservedObject var entitlementManager: EntitlementManager = .shared

    // MARK: - Resolved Display State

    private var isAdminUser: Bool {
        AdminAllowlist.isCurrentUserAdmin
    }

    /// Returns the effective status — falls back to trial when the Worker
    /// hasn't returned an entitlement yet (new user, offline, or dev mode).
    private var effectiveStatus: EntitlementStatus {
        if isAdminUser {
            return .active(periodEnd: .distantFuture)
        }
        if case .none = entitlementManager.status {
            return .trial(remainingSeconds: trialTracker.remainingSeconds)
        }
        return entitlementManager.status
    }

    private var statusLabel: String {
        if isAdminUser {
            return "Admin unlimited"
        }
        switch effectiveStatus {
        case .trial:
            return trialTracker.isExhausted ? "Trial ended" : "Free trial"
        case .active:
            return usageTracker.isOverCap ? "Out of time" : "Active"
        case .canceled:
            return "Canceled"
        case .expired:
            return "Expired"
        case .none:
            return "Free trial"
        }
    }

    private var statusColor: Color {
        if isAdminUser {
            return DS.Colors.accent
        }
        switch effectiveStatus {
        case .trial:
            if trialTracker.isExhausted { return DS.Colors.destructiveText }
            return Color(hex: "#60A5FA")  // Blue for trial
        case .active:
            if usageTracker.isOverCap { return DS.Colors.destructiveText }
            if usageTracker.usageProgress >= 0.8 { return DS.Colors.warning }
            return DS.Colors.success
        case .canceled:
            return DS.Colors.warning
        case .expired:
            return DS.Colors.textTertiary
        case .none:
            return Color(hex: "#60A5FA")
        }
    }

    /// Returns the time consumed/total as a display string (e.g. "43m of 3h")
    private var timeUsedLabel: String {
        if isAdminUser {
            return "Unlimited"
        }
        switch effectiveStatus {
        case .trial, .none:
            let used = trialTracker.totalSecondsUsed
            let total = TrialTracker.maxTrialSeconds
            return "\(formatDuration(used)) of \(formatDuration(total))"
        case .active, .canceled:
            let used = usageTracker.secondsUsed
            let total = UsageTracker.maxSecondsPerPeriod
            return "\(formatDuration(used)) of \(formatDuration(total))"
        case .expired:
            return "—"
        }
    }

    private var progress: Double {
        if isAdminUser {
            return 0
        }
        switch effectiveStatus {
        case .trial, .none:
            return trialTracker.usageProgress
        case .active, .canceled:
            return usageTracker.usageProgress
        case .expired:
            return 0
        }
    }

    private var progressColor: Color {
        if progress >= 1.0 { return DS.Colors.destructiveText }
        if progress >= 0.8 { return DS.Colors.warning }
        return DS.Colors.success
    }

    private var timeUsedHeader: String {
        if isAdminUser {
            return "Access"
        }
        switch effectiveStatus {
        case .trial, .none:
            return "Trial time used"
        case .active, .canceled:
            return "Time this month"
        case .expired:
            return "Time used"
        }
    }

    private var resetDateLabel: String? {
        if isAdminUser {
            return nil
        }
        switch effectiveStatus {
        case .trial, .none:
            return nil  // Trial never resets
        case .active, .canceled:
            guard let date = usageTracker.periodEnd else { return nil }
            let formatter = DateFormatter()
            formatter.dateStyle = .long
            return formatter.string(from: date)
        case .expired:
            return nil
        }
    }

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Status row
            HStack {
                Text("Status")
                    .font(.system(size: 12))
                    .foregroundColor(DS.Colors.textSecondary)
                Spacer()
                HStack(spacing: 5) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 7, height: 7)
                    Text(statusLabel)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(statusColor)
                }
            }

            // Time used row + progress bar
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(timeUsedHeader)
                        .font(.system(size: 12))
                        .foregroundColor(DS.Colors.textSecondary)
                    Spacer()
                    Text(timeUsedLabel)
                        .font(.system(size: 11))
                        .foregroundColor(DS.Colors.textTertiary)
                }
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color.white.opacity(0.08))
                        RoundedRectangle(cornerRadius: 2)
                            .fill(progressColor)
                            .frame(width: geometry.size.width * max(0, min(1, progress)))
                    }
                }
                .frame(height: 4)
            }

            // Reset date row
            if let resetDateLabel {
                HStack {
                    Text("Resets")
                        .font(.system(size: 12))
                        .foregroundColor(DS.Colors.textSecondary)
                    Spacer()
                    Text(resetDateLabel)
                        .font(.system(size: 11))
                        .foregroundColor(DS.Colors.textTertiary)
                }
            }

            // Action button
            manageButton
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                .fill(Color.white.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
        )
    }

    // MARK: - Action Button

    @ViewBuilder
    private var manageButton: some View {
        if isAdminUser {
            HStack {
                Text("Admin bypass is active")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(DS.Colors.accent)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                    .fill(DS.Colors.accent.opacity(0.10))
            )
        } else {
            switch effectiveStatus {
            case .active, .canceled:
                Button(action: {
                    Task { await EntitlementManager.shared.startCustomerPortal() }
                }) {
                    manageButtonContent(
                        label: "Manage subscription",
                        color: Color(hex: "#60A5FA")
                    )
                }
                .buttonStyle(.plain)
                .pointerCursor()

            case .trial, .expired, .none:
                Button(action: { Task { await EntitlementManager.shared.startCheckout() } }) {
                    manageButtonContent(
                        label: trialTracker.isExhausted ? "Subscribe — $19 / month" : "Upgrade",
                        color: DS.Colors.accent
                    )
                }
                .buttonStyle(.plain)
                .pointerCursor()
            }
        }
    }

    private func manageButtonContent(label: String, color: Color) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(color)
            Spacer()
            Image(systemName: "arrow.right")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(color)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .fill(color.opacity(0.10))
        )
    }

    // MARK: - Formatting

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let total = Int(max(0, seconds))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        if hours > 0 {
            if minutes == 0 { return "\(hours)h" }
            return "\(hours)h \(minutes)m"
        } else {
            return "\(minutes)m"
        }
    }
}
