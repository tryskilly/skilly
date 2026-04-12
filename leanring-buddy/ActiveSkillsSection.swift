// MARK: - Skilly
//
//  ActiveSkillsSection.swift
//  leanring-buddy
//
//  The "Active Now" section shown at the top of the main panel.
//  Shows auto-activated skill (matched to frontmost app) + pinned skills.
//  Max 3 cards visible; beyond that, users use the Skills Library.
//

import SwiftUI

struct ActiveSkillsSection: View {
    @ObservedObject var skillManager: SkillManager
    var onManageTapped: () -> Void

    private var activeSkills: [(skill: SkillDefinition, reason: ActivationReason)] {
        var result: [(SkillDefinition, ActivationReason)] = []

        // First: the currently active skill (auto-detected or manually selected)
        if let active = skillManager.activeSkill {
            let reason: ActivationReason
            if skillManager.hasManuallySelectedSkill {
                reason = skillManager.isPinned(active.metadata.id) ? .pinned : .manual
            } else {
                reason = .auto
            }
            result.append((active, reason))
        }

        // Then: all pinned skills that aren't already in the list
        let pinnedSkills = skillManager.installedSkills
            .filter { skillManager.isPinned($0.metadata.id) }
            .filter { skill in !result.contains(where: { $0.0.metadata.id == skill.metadata.id }) }

        for pinnedSkill in pinnedSkills {
            result.append((pinnedSkill, .pinned))
        }

        return result
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader

            if activeSkills.isEmpty {
                emptyState
            } else {
                VStack(spacing: 8) {
                    ForEach(activeSkills, id: \.skill.metadata.id) { entry in
                        activeSkillCard(skill: entry.skill, reason: entry.reason)
                    }
                }
            }

            manageButton
        }
    }

    // MARK: - Components

    private var sectionHeader: some View {
        HStack {
            Text("ACTIVE NOW")
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundColor(DS.Colors.accentText)
                .tracking(0.8)

            Spacer()

            if !activeSkills.isEmpty {
                Text("\(skillManager.installedSkills.count) installed")
                    .font(.system(size: 10))
                    .foregroundColor(DS.Colors.textTertiary)
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("No skill active")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(DS.Colors.textSecondary)
            Text("Skills give Skilly expertise in a specific app.")
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textTertiary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                .fill(Color.white.opacity(0.04))
        )
    }

    private func activeSkillCard(skill: SkillDefinition, reason: ActivationReason) -> some View {
        let isActive = skillManager.activeSkill?.metadata.id == skill.metadata.id
        let isPausedActive = isActive && skillManager.isSkillPaused
        let progress = isActive ? skillManager.activeSkillProgress : nil

        return HStack(alignment: .top, spacing: 10) {
            // Status dot
            Circle()
                .fill(isPausedActive ? DS.Colors.textTertiary : DS.Colors.success)
                .frame(width: 8, height: 8)
                .padding(.top, 5)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(skill.metadata.name)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(DS.Colors.textPrimary)
                        .lineLimit(1)
                        .truncationMode(.tail)

                    reasonBadge(reason)
                }

                HStack(spacing: 4) {
                    Text(skill.metadata.targetApp)
                        .font(.system(size: 11))
                        .foregroundColor(DS.Colors.textTertiary)

                    if let progress {
                        Text("·")
                            .foregroundColor(DS.Colors.textTertiary)
                        Text("\(progress.completedStageIds.count) of \(skill.curriculumStages.count)")
                            .font(.system(size: 11))
                            .foregroundColor(DS.Colors.textTertiary)
                    }
                }

                if isActive, let progress {
                    progressBar(
                        completed: progress.completedStageIds.count,
                        total: skill.curriculumStages.count
                    )
                    .padding(.top, 4)
                }
            }

            Spacer()
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                .fill(DS.Colors.accentSubtle)
        )
        .overlay(
            RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                .stroke(DS.Colors.accent.opacity(0.25), lineWidth: 0.5)
        )
    }

    private func reasonBadge(_ reason: ActivationReason) -> some View {
        Text(reason.label)
            .font(.system(size: 9, weight: .semibold, design: .rounded))
            .foregroundColor(reason.color)
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(
                Capsule()
                    .fill(reason.color.opacity(0.15))
            )
    }

    private func progressBar(completed: Int, total: Int) -> some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(Color.white.opacity(0.08))
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(DS.Colors.accent)
                    .frame(
                        width: geometry.size.width * CGFloat(completed) / CGFloat(max(total, 1))
                    )
            }
        }
        .frame(height: 3)
    }

    private var manageButton: some View {
        Button(action: onManageTapped) {
            HStack {
                Text(skillManager.installedSkills.isEmpty ? "Import your first skill" : "Manage skills")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(DS.Colors.textSecondary)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(DS.Colors.textTertiary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                    .fill(Color.white.opacity(0.05))
            )
            .overlay(
                RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                    .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    // MARK: - Activation Reason

    enum ActivationReason {
        case auto      // Matched to frontmost app via AppDetectionMonitor
        case manual    // User picked this skill explicitly
        case pinned    // User pinned this skill to stay active

        var label: String {
            switch self {
            case .auto: return "AUTO"
            case .manual: return "MANUAL"
            case .pinned: return "PINNED"
            }
        }

        var color: Color {
            switch self {
            case .auto: return DS.Colors.success
            case .manual: return DS.Colors.accent
            case .pinned: return DS.Colors.accentText
            }
        }
    }
}
