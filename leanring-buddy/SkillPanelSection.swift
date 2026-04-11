// MARK: - Skilly

import SwiftUI
import Combine
import UniformTypeIdentifiers

/// Displays the skill management UI in the menu bar dropdown panel.
///
/// Shows:
///   1. A list of all installed skills with activation controls
///   2. Progress details for the active skill (stage list, reset)
///   3. Import controls for adding new skills
struct SkillPanelSection: View {

    @ObservedObject var skillManager: SkillManager

    /// Whether to show the full stage list below the progress bar.
    @State private var showProgressDetail = false

    /// Guards the destructive "Reset Progress" action with a confirmation prompt.
    @State private var showResetConfirmation = false

    /// Controls the visibility of the URL import text field.
    @State private var showURLImportField = false

    /// The URL text being entered for import.
    @State private var importURLText = ""

    /// Error message to display if import fails.
    @State private var importError: String?

    /// Pending delete target shown in the confirmation alert.
    @State private var pendingSkillDeletion: PendingSkillDeletion?
    /// URL-based skill import is intentionally hidden for now, but kept in code
    /// so it can be re-enabled without rebuilding the import flow.
    private let shouldShowURLImportUI = false

    private struct PendingSkillDeletion: Identifiable {
        let id: String
        let skillName: String
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeading

            Spacer().frame(height: DS.Spacing.sm)

            if skillManager.installedSkills.isEmpty {
                emptyState
            } else {
                installedSkillsList

                if let activeSkill = skillManager.activeSkill, !skillManager.isSkillPaused {
                    Spacer().frame(height: DS.Spacing.md)
                    activeSkillProgressSection(skill: activeSkill)
                }
            }

            Spacer().frame(height: DS.Spacing.md)
            importSection
        }
        .alert(item: $pendingSkillDeletion) { pendingSkillDeletion in
            Alert(
                title: Text("Remove Skill"),
                message: Text("Remove \"\(pendingSkillDeletion.skillName)\" from installed skills?"),
                primaryButton: .destructive(Text("Remove")) {
                    removeSkill(skillId: pendingSkillDeletion.id)
                },
                secondaryButton: .cancel()
            )
        }
    }

    // MARK: - Section Heading

    private var sectionHeading: some View {
        Text("SKILLS")
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .foregroundColor(DS.Colors.accentText)
            .tracking(0.8)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
            Text("No skills installed yet.")
                .font(.system(size: 13))
                .foregroundColor(DS.Colors.textSecondary)

            Text("Import a skill to get started.")
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textTertiary)
        }
    }

    // MARK: - Installed Skills List

    private var installedSkillsList: some View {
        VStack(alignment: .leading, spacing: DS.Spacing.xs) {
            ForEach(skillManager.installedSkills, id: \.metadata.id) { skill in
                skillRow(skill: skill)
            }
        }
    }

    private func skillRow(skill: SkillDefinition) -> some View {
        let isActive = skillManager.activeSkill?.metadata.id == skill.metadata.id
        let isPaused = isActive && skillManager.isSkillPaused

        return HStack(spacing: DS.Spacing.xs) {
            Button(action: {
                if isActive {
                    skillManager.deactivateSkill()
                } else {
                    skillManager.activateSkill(skill, isManualSelection: true)
                }
            }) {
                HStack(spacing: DS.Spacing.sm) {
                    // Active indicator
                    Circle()
                        .fill(isActive ? (isPaused ? DS.Colors.textTertiary : DS.Colors.success) : Color.clear)
                        .frame(width: 6, height: 6)
                        .overlay(
                            Circle()
                                .stroke(isActive ? DS.Colors.borderSubtle : Color.clear, lineWidth: 0.5)
                        )

                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: DS.Spacing.xs) {
                            Text(skill.metadata.name)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(DS.Colors.textPrimary)

                            if isActive && !skillManager.hasManuallySelectedSkill {
                                autoBadge
                            }
                        }

                        HStack(spacing: 4) {
                            Text(skill.metadata.targetApp)
                                .font(.system(size: 10))
                                .foregroundColor(DS.Colors.textTertiary)

                            Image(systemName: "info.circle")
                                .font(.system(size: 10, weight: .regular))
                                .foregroundColor(DS.Colors.textTertiary)
                                .help(autoLoadTooltipText(for: skill))
                        }
                    }

                    Spacer()

                    if isActive {
                        stageProgressIndicator(skill: skill)
                    }
                }
                .padding(.horizontal, DS.Spacing.sm)
                .padding(.vertical, DS.Spacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                        .fill(isActive ? DS.Colors.accentSubtle : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                        .stroke(isActive ? DS.Colors.accent.opacity(0.3) : Color.clear, lineWidth: 0.5)
                )
            }
            .buttonStyle(.plain)
            .onHover { isInside in
                if isInside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
            }

            Button(action: {
                pendingSkillDeletion = PendingSkillDeletion(id: skill.metadata.id, skillName: skill.metadata.name)
            }) {
                Image(systemName: "trash")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(DS.Colors.destructiveText)
                    .frame(width: 22, height: 22)
                    .background(
                        RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                            .fill(DS.Colors.surface2)
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
            .accessibilityLabel("Remove \(skill.metadata.name)")
        }
    }

    private var autoBadge: some View {
        Text("Auto")
            .font(.system(size: 9, weight: .medium))
            .foregroundColor(DS.Colors.accentText)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(DS.Colors.accent.opacity(0.2))
            )
    }

    private func stageProgressIndicator(skill: SkillDefinition) -> some View {
        guard let progress = skillManager.activeSkillProgress else {
            return AnyView(EmptyView())
        }

        let totalStages = max(skill.curriculumStages.count, 1)
        let completedStages = progress.completedStageIds.count
        let progressFraction = Double(completedStages) / Double(totalStages)

        return AnyView(
            Text("\(Int(progressFraction * 100))%")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(DS.Colors.textTertiary)
        )
    }

    // MARK: - Active Skill Progress Section

    private func activeSkillProgressSection(skill: SkillDefinition) -> some View {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
            if let progress = skillManager.activeSkillProgress {
                progressBar(skill: skill, progress: progress)
                stageDetailToggle(skill: skill, progress: progress)
                activeControlButtons
                resetProgressButton
            }
        }
    }

    // MARK: - Progress Bar

    private func progressBar(skill: SkillDefinition, progress: SkillProgress) -> some View {
        let totalStageCount = max(skill.curriculumStages.count, 1)
        let completedStageCount = progress.completedStageIds.count
        let completionFraction = Double(completedStageCount) / Double(totalStageCount)
        let completionPercentage = Int(completionFraction * 100)

        let currentStageName = skill.curriculumStages.first(where: { $0.id == progress.currentStageId })?.name
            ?? progress.currentStageId

        return VStack(alignment: .leading, spacing: 4) {
            Text("Stage: \(currentStageName)")
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textSecondary)

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(DS.Colors.surface3)
                        .frame(height: 6)

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

    // MARK: - Stage Detail Toggle

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

    // MARK: - Stage List

    private func stageList(skill: SkillDefinition, progress: SkillProgress) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(skill.curriculumStages, id: \.id) { stage in
                stageRow(stage: stage, progress: progress)
            }
        }
        .padding(.leading, 4)
    }

    private func stageRow(stage: CurriculumStage, progress: SkillProgress) -> some View {
        let isCompleted = progress.completedStageIds.contains(stage.id)
        let isCurrent = progress.currentStageId == stage.id

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

    // MARK: - Control Buttons

    private var activeControlButtons: some View {
        HStack(spacing: 8) {
            controlButton(label: "Pause", action: {
                skillManager.pauseSkill()
            })

            controlButton(label: "Deactivate", action: {
                skillManager.deactivateSkill()
            })
        }
    }

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

    // MARK: - Import Section

    private var importSection: some View {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
            Divider()
                .background(DS.Colors.borderSubtle)

            VStack(alignment: .leading, spacing: DS.Spacing.sm) {
                Button(action: {
                    openFilePicker()
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "folder.badge.plus")
                            .font(.system(size: 11, weight: .medium))
                        Text("Import from File...")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(DS.Colors.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                            .fill(DS.Colors.surface2)
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

                if shouldShowURLImportUI {
                    Button(action: {
                        withAnimation(.easeInOut(duration: DS.Animation.fast)) {
                            showURLImportField.toggle()
                        }
                    }) {
                        HStack(spacing: 6) {
                            Image(systemName: "link")
                                .font(.system(size: 11, weight: .medium))
                            Text("Import from URL...")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(DS.Colors.textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                                .fill(DS.Colors.surface2)
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

                    if showURLImportField {
                        VStack(alignment: .leading, spacing: DS.Spacing.xs) {
                            TextField("Paste skill URL...", text: $importURLText)
                                .textFieldStyle(.plain)
                                .font(.system(size: 12))
                                .foregroundColor(DS.Colors.textPrimary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(
                                    RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                                        .fill(DS.Colors.surface1)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                                        .stroke(DS.Colors.borderStrong, lineWidth: 0.5)
                                )
                                .overlay(IBeamCursorView())

                            Button(action: {
                                importFromURL()
                            }) {
                                Text("Import")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(DS.Colors.textOnAccent)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 6)
                                    .background(
                                        RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                                            .fill(DS.Colors.accent)
                                    )
                            }
                            .buttonStyle(.plain)
                            .onHover { isInside in
                                if isInside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                            }

                            if let error = importError {
                                Text(error)
                                    .font(.system(size: 10))
                                    .foregroundColor(DS.Colors.destructiveText)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Import Actions

    private func openFilePicker() {
        let fileManager = FileManager.default
        NSApp.activate(ignoringOtherApps: true)
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = false
        panel.allowedContentTypes = [.folder, .plainText, UTType(filenameExtension: "md") ?? .plainText]
        panel.allowsOtherFileTypes = true
        panel.prompt = "Import"
        panel.message = "Select a skill folder (or a SKILL.md file inside it)."

        if panel.runModal() == .OK, let selectedURL = panel.url {
            let importDirectoryURL: URL
            var isDirectory = ObjCBool(false)
            if fileManager.fileExists(atPath: selectedURL.path, isDirectory: &isDirectory), isDirectory.boolValue {
                importDirectoryURL = selectedURL
            } else if selectedURL.lastPathComponent.lowercased() == "skill.md" {
                importDirectoryURL = selectedURL.deletingLastPathComponent()
            } else {
                importError = "Select a folder containing SKILL.md, or select SKILL.md directly."
                return
            }

            do {
                _ = try skillManager.importSkillFromDirectory(at: importDirectoryURL)
                importError = nil
            } catch {
                importError = "Failed to import: \(error.localizedDescription)"
            }
        }
    }

    private func importFromURL() {
        guard !importURLText.isEmpty else { return }

        do {
            _ = try skillManager.importSkillFromURL(importURLText)
            importURLText = ""
            showURLImportField = false
            importError = nil
        } catch {
            importError = "Failed to import: \(error.localizedDescription)"
        }
    }

    private func removeSkill(skillId: String) {
        do {
            try skillManager.removeSkill(skillId: skillId)
            importError = nil
        } catch {
            importError = "Failed to remove skill: \(error.localizedDescription)"
        }
    }

    private func autoLoadTooltipText(for skill: SkillDefinition) -> String {
        if !skillManager.autoDetectionEnabled {
            return "Auto-load is currently disabled."
        }

        guard let frontmostAppBundleId = skillManager.frontmostAppBundleId, !frontmostAppBundleId.isEmpty else {
            return "Skilly cannot read the current frontmost app yet."
        }

        let expectedBundleId = skill.metadata.bundleId
        if expectedBundleId.hasPrefix("generic.") {
            return "This skill does not declare a specific app bundle id, so it will not auto-load for a specific app."
        }

        if expectedBundleId.caseInsensitiveCompare(frontmostAppBundleId) == .orderedSame {
            return "Auto-load is active: this skill matches the current app (\(frontmostAppBundleId))."
        }

        return "Auto-load expects \(expectedBundleId), but current app is \(frontmostAppBundleId)."
    }
}
