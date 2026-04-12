// MARK: - Skilly
//
//  PanelBodyView.swift
//  leanring-buddy
//
//  The main content body of the Skilly menu bar panel — a single
//  scrollable view with "ACTIVE NOW" and "INSTALLED" sections.
//  No navigation sub-views; everything is visible at once.
//
//  Per-skill overflow menus (⋯) reveal on hover or right-click and
//  provide Pause/Resume, Reset progress, View details, Show in Finder,
//  and Remove skill. Remove shows a confirmation dialog.
//

import SwiftUI
import UniformTypeIdentifiers

struct PanelBodyView: View {
    @ObservedObject var skillManager: SkillManager

    @State private var hoveredSkillId: String?
    @State private var pendingDeletion: PendingDeletion?
    @State private var showImportPicker = false
    @State private var expandedStageListSkillId: String?

    private struct PendingDeletion: Identifiable {
        let id: String
        let name: String
    }

    // MARK: - Partitioning

    /// Skills shown in "ACTIVE NOW": the currently-active skill + any matching
    /// frontmost app skills. A skill is "active" if it's running (active),
    /// paused (was active), or matches the frontmost app.
    private var activeNowSkills: [SkillDefinition] {
        var result: [SkillDefinition] = []

        if let active = skillManager.activeSkill {
            result.append(active)
        }

        return result
    }

    private var installedSkills: [SkillDefinition] {
        skillManager.installedSkills.filter { skill in
            !activeNowSkills.contains(where: { $0.metadata.id == skill.metadata.id })
        }
    }

    /// Friendly name of the frontmost app (e.g. "Figma"), derived from bundle ID.
    private var frontmostAppName: String? {
        guard let bundleId = skillManager.frontmostAppBundleId, !bundleId.isEmpty else { return nil }
        // Try to get a display name from NSRunningApplication
        if let runningApp = NSWorkspace.shared.runningApplications.first(where: { $0.bundleIdentifier == bundleId }) {
            return runningApp.localizedName ?? bundleId
        }
        return bundleId
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            PlanStrip()
            activeNowSection
            installedSection
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .alert(item: $pendingDeletion) { deletion in
            Alert(
                title: Text("Remove \(deletion.name)?"),
                message: Text("This deletes the skill and your progress through it. You can re-import it later from the SKILL.md file."),
                primaryButton: .destructive(Text("Remove")) {
                    try? skillManager.removeSkill(skillId: deletion.id)
                },
                secondaryButton: .cancel()
            )
        }
        .fileImporter(
            isPresented: $showImportPicker,
            allowedContentTypes: [.folder],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result, let url = urls.first {
                try? skillManager.importSkillFromDirectory(url)
            }
        }
    }

    // MARK: - Active Now Section

    @ViewBuilder
    private var activeNowSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("ACTIVE NOW")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundColor(DS.Colors.accentText)
                    .tracking(0.8)

                Spacer()

                if let appName = frontmostAppName {
                    frontmostAppBadge(appName)
                }
            }

            if activeNowSkills.isEmpty {
                emptyActiveState
            } else {
                VStack(spacing: 8) {
                    ForEach(activeNowSkills, id: \.metadata.id) { skill in
                        activeSkillCard(skill: skill)
                    }
                }
            }
        }
    }

    private func frontmostAppBadge(_ appName: String) -> some View {
        HStack(spacing: 5) {
            Circle()
                .fill(DS.Colors.success)
                .frame(width: 6, height: 6)
            Text(appName)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(DS.Colors.accentText)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(
            Capsule()
                .fill(DS.Colors.accent.opacity(0.15))
        )
        .overlay(
            Capsule()
                .stroke(DS.Colors.accent.opacity(0.3), lineWidth: 0.5)
        )
    }

    @ViewBuilder
    private var emptyActiveState: some View {
        let appName = frontmostAppName ?? "this app"
        VStack(spacing: 10) {
            Image(systemName: "safari")
                .font(.system(size: 22, weight: .light))
                .foregroundColor(DS.Colors.textTertiary)
                .frame(width: 40, height: 40)
                .background(
                    Circle().fill(Color.white.opacity(0.05))
                )

            Text("No skills for \(appName)")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(DS.Colors.textPrimary)

            Text("Skills activate when you open their matching app. Install one to get started.")
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textTertiary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    // MARK: - Active Skill Card

    private func activeSkillCard(skill: SkillDefinition) -> some View {
        let isHovered = hoveredSkillId == skill.metadata.id
        let isPaused = skillManager.isSkillPaused
        let progress = skillManager.activeSkillProgress
        let stageNumber = (progress?.completedStageIds.count ?? 0) + 1
        let totalStages = skill.curriculumStages.count
        let currentStageName = skill.curriculumStages.first(where: { $0.id == progress?.currentStageId })?.name
            ?? "Getting started"
        let isStageListExpanded = expandedStageListSkillId == skill.metadata.id

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .fill(isPaused ? DS.Colors.textTertiary : DS.Colors.success)
                    .frame(width: 8, height: 8)
                    .padding(.top, 5)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(skill.metadata.name)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(DS.Colors.textPrimary)
                            .lineLimit(1)

                        Spacer(minLength: 6)

                        stateBadge(isPaused: isPaused)

                        if isHovered {
                            SkillRowActionMenu(
                                skill: skill,
                                skillManager: skillManager,
                                isActive: true,
                                isPaused: isPaused,
                                onRemoveRequested: {
                                    pendingDeletion = PendingDeletion(
                                        id: skill.metadata.id,
                                        name: skill.metadata.name
                                    )
                                }
                            )
                        }
                    }

                    // MARK: - Skilly — Tap the stage label to expand/collapse the full curriculum
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.18)) {
                            expandedStageListSkillId = isStageListExpanded ? nil : skill.metadata.id
                        }
                    }) {
                        HStack(spacing: 4) {
                            Text("Stage \(stageNumber) of \(totalStages) · \(currentStageName)")
                                .font(.system(size: 11))
                                .foregroundColor(DS.Colors.textTertiary)
                                .lineLimit(1)
                            Image(systemName: isStageListExpanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 8, weight: .semibold))
                                .foregroundColor(DS.Colors.textTertiary)
                        }
                    }
                    .buttonStyle(.plain)
                    .pointerCursor()

                    progressBar(completed: progress?.completedStageIds.count ?? 0, total: totalStages)
                        .padding(.top, 2)
                }
            }

            if isStageListExpanded {
                stageList(skill: skill, progress: progress)
                    .padding(.leading, 18)
            }
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
        .contextMenu {
            contextMenuItems(
                skill: skill,
                isActive: true,
                isPaused: isPaused
            )
        }
        .onHover { inside in
            hoveredSkillId = inside ? skill.metadata.id : (hoveredSkillId == skill.metadata.id ? nil : hoveredSkillId)
        }
    }

    private func stateBadge(isPaused: Bool) -> some View {
        Text(isPaused ? "PAUSED" : "AUTO")
            .font(.system(size: 9, weight: .semibold, design: .rounded))
            .foregroundColor(isPaused ? DS.Colors.textTertiary : DS.Colors.accentText)
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill((isPaused ? DS.Colors.textTertiary : DS.Colors.accent).opacity(0.15))
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

    // MARK: - Stage List (expanded curriculum view)

    /// Full curriculum stage list shown when the user taps the stage label
    /// on the active skill card. Each row is tappable to manually jump to
    /// that stage — useful when the user wants to replay a section or
    /// skip ahead past content they already know.
    @ViewBuilder
    private func stageList(skill: SkillDefinition, progress: SkillProgress?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(Array(skill.curriculumStages.enumerated()), id: \.element.id) { index, stage in
                stageRow(
                    stage: stage,
                    stageNumber: index + 1,
                    progress: progress
                )
            }
        }
    }

    private func stageRow(
        stage: CurriculumStage,
        stageNumber: Int,
        progress: SkillProgress?
    ) -> some View {
        let isCompleted = progress?.completedStageIds.contains(stage.id) ?? false
        let isCurrent = progress?.currentStageId == stage.id

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
            HStack(spacing: 7) {
                Image(systemName: statusSymbol)
                    .font(.system(size: 10))
                    .foregroundColor(symbolColor)
                    .frame(width: 12)

                Text("\(stageNumber).")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(textColor)
                    .frame(width: 16, alignment: .leading)

                Text(stage.name)
                    .font(.system(size: 11))
                    .foregroundColor(textColor)
                    .lineLimit(1)

                Spacer()
            }
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                    .fill(isCurrent ? DS.Colors.accent.opacity(0.12) : Color.clear)
            )
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    // MARK: - Installed Section

    @ViewBuilder
    private var installedSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("INSTALLED")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundColor(DS.Colors.textTertiary)
                    .tracking(0.8)

                Spacer()

                if !installedSkills.isEmpty {
                    Text("\(installedSkills.count) \(installedSkills.count == 1 ? "skill" : "skills")")
                        .font(.system(size: 10))
                        .foregroundColor(DS.Colors.textTertiary)
                }
            }

            if installedSkills.isEmpty {
                installedEmptyState
            } else {
                VStack(spacing: 4) {
                    ForEach(installedSkills, id: \.metadata.id) { skill in
                        installedSkillRow(skill: skill)
                    }
                }
            }

            importButton
        }
    }

    private var installedEmptyState: some View {
        Text("No other skills installed.")
            .font(.system(size: 11))
            .foregroundColor(DS.Colors.textTertiary)
            .padding(.vertical, 6)
    }

    private func installedSkillRow(skill: SkillDefinition) -> some View {
        let isHovered = hoveredSkillId == skill.metadata.id

        return HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(Color.white.opacity(0.25))
                .frame(width: 6, height: 6)
                .padding(.top, 6)

            VStack(alignment: .leading, spacing: 2) {
                Text(skill.metadata.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(DS.Colors.textPrimary)
                    .lineLimit(1)

                Text(installedSubtitle(for: skill))
                    .font(.system(size: 10))
                    .foregroundColor(DS.Colors.textTertiary)
                    .lineLimit(1)
            }

            Spacer()

            if isHovered {
                SkillRowActionMenu(
                    skill: skill,
                    skillManager: skillManager,
                    isActive: false,
                    isPaused: false,
                    onRemoveRequested: {
                        pendingDeletion = PendingDeletion(
                            id: skill.metadata.id,
                            name: skill.metadata.name
                        )
                    }
                )
            }
        }
        .padding(.vertical, 7)
        .padding(.horizontal, 8)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .fill(isHovered ? Color.white.opacity(0.04) : Color.clear)
        )
        .contentShape(Rectangle())
        .contextMenu {
            contextMenuItems(
                skill: skill,
                isActive: false,
                isPaused: false
            )
        }
        .onHover { inside in
            hoveredSkillId = inside ? skill.metadata.id : (hoveredSkillId == skill.metadata.id ? nil : hoveredSkillId)
        }
    }

    /// Contextual subtitle for an installed skill row:
    /// - Skills with a target app: "Auto-activates in {App}"
    /// - Skills with no app match: "Always available · Tap to activate"
    private func installedSubtitle(for skill: SkillDefinition) -> String {
        let targetApp = skill.metadata.targetApp
        if !targetApp.isEmpty && targetApp.lowercased() != "general" {
            return "Auto-activates in \(targetApp)"
        }
        return "Always available · Tap to activate"
    }

    // MARK: - Import Button

    private var importButton: some View {
        Button(action: { showImportPicker = true }) {
            HStack {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .semibold))
                Text("Import skill")
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(DS.Colors.textSecondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .background(
                RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                    .fill(Color.white.opacity(0.04))
            )
            .overlay(
                RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                    .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .padding(.top, 4)
    }

    // MARK: - Context Menu Items (reuse of action menu structure)

    @ViewBuilder
    private func contextMenuItems(skill: SkillDefinition, isActive: Bool, isPaused: Bool) -> some View {
        if isActive {
            if isPaused {
                Button("Resume", systemImage: "play.circle") {
                    skillManager.resumeSkill()
                }
            } else {
                Button("Pause", systemImage: "pause.circle") {
                    skillManager.pauseSkill()
                }
            }
            Button("Reset progress", systemImage: "arrow.counterclockwise") {
                skillManager.resetProgress()
            }
        } else {
            Button("Activate", systemImage: "play.circle") {
                skillManager.activateSkill(skill, isManualSelection: true)
            }
        }

        Button("View details", systemImage: "info.circle") {
            if let path = skill.sourceDirectoryPath {
                NSWorkspace.shared.open(URL(fileURLWithPath: path).appendingPathComponent("SKILL.md"))
            }
        }

        Button("Show in Finder", systemImage: "folder") {
            if let path = skill.sourceDirectoryPath {
                NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
            }
        }

        Divider()

        Button("Remove skill", systemImage: "trash", role: .destructive) {
            pendingDeletion = PendingDeletion(
                id: skill.metadata.id,
                name: skill.metadata.name
            )
        }
    }
}
