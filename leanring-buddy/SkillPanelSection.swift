// MARK: - Skilly

import SwiftUI

/// Displays the current skill state and controls in the menu bar dropdown panel.
///
/// Shows one of three states depending on SkillManager:
///   1. No skill active — prompt to activate the first installed skill
///   2. Skill active — progress bar, stage list, and pause/change controls
///   3. Skill paused — resume/change controls without the progress bar
struct SkillPanelSection: View {

    @ObservedObject var skillManager: SkillManager

    /// Whether to show the full stage list below the progress bar.
    @State private var showProgressDetail = false

    /// Guards the destructive "Reset Progress" action with a confirmation prompt.
    @State private var showResetConfirmation = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeading

            Spacer().frame(height: 8)

            if let activeSkill = skillManager.activeSkill {
                if skillManager.isSkillPaused {
                    pausedState(skill: activeSkill)
                } else {
                    activeState(skill: activeSkill)
                }
            } else {
                noSkillActiveState
            }
        }
    }

    // MARK: - Section Heading

    private var sectionHeading: some View {
        Text("SKILLS")
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .foregroundColor(DS.Colors.textTertiary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - State 1: No Skill Active

    private var noSkillActiveState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("No skill active.")
                .font(.system(size: 13))
                .foregroundColor(DS.Colors.textSecondary)

            if let firstInstalledSkill = skillManager.installedSkills.first {
                activateSkillButton(skill: firstInstalledSkill)
            }
        }
    }

    /// A tappable pill button that activates the given skill.
    private func activateSkillButton(skill: SkillDefinition) -> some View {
        Button(action: {
            skillManager.activateSkill(skill)
        }) {
            HStack(spacing: 4) {
                Text(skill.metadata.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(DS.Colors.accentText)
                Image(systemName: "arrow.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(DS.Colors.accentText)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                    .fill(DS.Colors.accentSubtle)
            )
            .overlay(
                RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                    .stroke(DS.Colors.accent.opacity(0.3), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .onHover { isInside in
            if isInside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
    }

    // MARK: - State 2: Skill Active

    private func activeState(skill: SkillDefinition) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            skillNameAndStatusRow(skillName: skill.metadata.name, isPaused: false)

            if let progress = skillManager.activeSkillProgress {
                progressBar(skill: skill, progress: progress)
                stageDetailToggle(skill: skill, progress: progress)
            }

            activeControlButtons

            resetProgressButton
        }
    }

    // MARK: - State 3: Skill Paused

    private func pausedState(skill: SkillDefinition) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            skillNameAndStatusRow(skillName: skill.metadata.name, isPaused: true)
            pausedControlButtons
        }
    }

    // MARK: - Shared Subviews

    /// Displays the skill name and an active/paused status indicator dot with label.
    private func skillNameAndStatusRow(skillName: String, isPaused: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(skillName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(DS.Colors.textPrimary)

            HStack(spacing: 5) {
                Circle()
                    .fill(isPaused ? DS.Colors.textTertiary : DS.Colors.success)
                    .frame(width: 6, height: 6)
                Text(isPaused ? "Paused" : "Active")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(isPaused ? DS.Colors.textTertiary : DS.Colors.success)
            }
        }
    }

    /// A segmented progress bar showing stage completion percentage with a label.
    private func progressBar(skill: SkillDefinition, progress: SkillProgress) -> some View {
        let totalStageCount = max(skill.curriculumStages.count, 1)
        let completedStageCount = progress.completedStageIds.count
        let completionFraction = Double(completedStageCount) / Double(totalStageCount)
        let completionPercentage = Int(completionFraction * 100)

        // Find the human-readable name of the current stage by matching against the curriculum.
        let currentStageName = skill.curriculumStages.first(where: { $0.id == progress.currentStageId })?.name
            ?? progress.currentStageId

        return VStack(alignment: .leading, spacing: 4) {
            Text("Stage: \(currentStageName)")
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textSecondary)

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Track (unfilled background)
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(DS.Colors.surface3)
                        .frame(height: 6)

                    // Fill (completed portion)
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(DS.Colors.success)
                        .frame(width: max(geometry.size.width * completionFraction, completionFraction > 0 ? 6 : 0), height: 6)
                }
            }
            .frame(height: 6)

            Text("\(completionPercentage)%")
                .font(.system(size: 10))
                .foregroundColor(DS.Colors.textTertiary)
        }
    }

    /// A toggle button that shows/hides the detailed stage list.
    private func stageDetailToggle(skill: SkillDefinition, progress: SkillProgress) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Button(action: {
                withAnimation(.easeInOut(duration: DS.Animation.fast)) {
                    showProgressDetail.toggle()
                }
            }) {
                HStack(spacing: 4) {
                    Text("Stages")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(DS.Colors.textSecondary)
                    Image(systemName: showProgressDetail ? "chevron.up" : "chevron.down")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(DS.Colors.textTertiary)
                }
            }
            .buttonStyle(.plain)
            .onHover { isInside in
                if isInside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
            }

            if showProgressDetail {
                stageList(skill: skill, progress: progress)
            }
        }
    }

    /// The ordered list of curriculum stages with completion indicators.
    /// Tapping a stage calls manuallySetCurrentStage on the skill manager.
    private func stageList(skill: SkillDefinition, progress: SkillProgress) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(skill.curriculumStages, id: \.id) { stage in
                stageRow(stage: stage, progress: progress)
            }
        }
        .padding(.leading, 4)
    }

    /// A single row in the stage list.
    private func stageRow(stage: CurriculumStage, progress: SkillProgress) -> some View {
        let isCompleted = progress.completedStageIds.contains(stage.id)
        let isCurrent = progress.currentStageId == stage.id
        let isFuture = !isCompleted && !isCurrent

        let statusSymbol: String = {
            if isCompleted { return "checkmark.circle.fill" }
            if isCurrent { return "circle.fill" }
            return "circle"
        }()

        let symbolColor: Color = {
            if isCompleted { return DS.Colors.success }
            if isCurrent { return DS.Colors.accentText }
            return DS.Colors.textTertiary
        }()

        let textColor: Color = {
            if isCurrent { return DS.Colors.textPrimary }
            if isCompleted { return DS.Colors.textSecondary }
            return DS.Colors.textTertiary
        }()

        return Button(action: {
            skillManager.manuallySetCurrentStage(stageId: stage.id)
        }) {
            HStack(spacing: 6) {
                Image(systemName: statusSymbol)
                    .font(.system(size: 10))
                    .foregroundColor(symbolColor)

                Text(stage.name)
                    .font(.system(size: 12))
                    .foregroundColor(textColor)

                Spacer()
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                    .fill(isCurrent ? DS.Colors.accentSubtle : Color.clear)
            )
        }
        .buttonStyle(.plain)
        .onHover { isInside in
            if isInside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
    }

    // MARK: - Control Button Rows

    /// Pause + Change Skill buttons shown when the skill is active.
    private var activeControlButtons: some View {
        HStack(spacing: 8) {
            controlButton(label: "Pause", action: {
                skillManager.pauseSkill()
            })

            controlButton(label: "Change Skill", action: {
                skillManager.deactivateSkill()
            })
        }
    }

    /// Resume + Change Skill buttons shown when the skill is paused.
    private var pausedControlButtons: some View {
        HStack(spacing: 8) {
            controlButton(label: "Resume", action: {
                skillManager.resumeSkill()
            })

            controlButton(label: "Change Skill", action: {
                skillManager.deactivateSkill()
            })
        }
    }

    /// A generic secondary-style button used for skill controls.
    private func controlButton(label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(DS.Colors.textSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                        .fill(Color.white.opacity(0.08))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                        .stroke(DS.Colors.borderSubtle, lineWidth: 0.5)
                )
        }
        .buttonStyle(.plain)
        .onHover { isInside in
            if isInside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
    }

    // MARK: - Reset Button

    /// A small destructive text button that resets all progress for the active skill.
    /// Tapping it once shows an inline confirmation; tapping again confirms the reset.
    private var resetProgressButton: some View {
        Group {
            if showResetConfirmation {
                HStack(spacing: 8) {
                    Text("Are you sure?")
                        .font(.system(size: 11))
                        .foregroundColor(DS.Colors.textTertiary)

                    Button(action: {
                        skillManager.resetProgress()
                        showResetConfirmation = false
                    }) {
                        Text("Yes, Reset")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(DS.Colors.destructiveText)
                    }
                    .buttonStyle(.plain)
                    .onHover { isInside in
                        if isInside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                    }

                    Button(action: {
                        showResetConfirmation = false
                    }) {
                        Text("Cancel")
                            .font(.system(size: 11))
                            .foregroundColor(DS.Colors.textTertiary)
                    }
                    .buttonStyle(.plain)
                    .onHover { isInside in
                        if isInside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                    }
                }
            } else {
                Button(action: {
                    showResetConfirmation = true
                }) {
                    Text("Reset Progress")
                        .font(.system(size: 11))
                        .foregroundColor(DS.Colors.textTertiary)
                }
                .buttonStyle(.plain)
                .onHover { isInside in
                    if isInside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                }
            }
        }
    }
}
