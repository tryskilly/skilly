// MARK: - Skilly
//
//  SkillLibraryView.swift
//  leanring-buddy
//
//  Full skills library shown when user taps "Manage skills" from the main panel.
//  Lists all installed skills with expand-to-detail rows. Import button in header.
//  Back button returns to the main panel view.
//

import SwiftUI
import UniformTypeIdentifiers

struct SkillLibraryView: View {
    @ObservedObject var skillManager: SkillManager
    @ObservedObject var navigator: PanelNavigator

    @State private var searchText: String = ""
    @State private var expandedSkillId: String?
    @State private var pendingDeletion: PendingDeletion?
    @State private var showFileImporter = false
    @State private var importError: String?

    private struct PendingDeletion: Identifiable {
        let id: String
        let skillName: String
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().background(DS.Colors.borderSubtle).padding(.horizontal, 16)
            searchField
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if filteredSkills.isEmpty {
                        emptyState
                    } else {
                        skillList
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
        }
        .frame(maxHeight: 440)
        .alert(item: $pendingDeletion) { deletion in
            Alert(
                title: Text("Remove Skill"),
                message: Text("Remove “\(deletion.skillName)” from your library?"),
                primaryButton: .destructive(Text("Remove")) {
                    try? skillManager.removeSkill(skillId: deletion.id)
                },
                secondaryButton: .cancel()
            )
        }
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.folder],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result, let url = urls.first {
                do {
                    try skillManager.importSkillFromDirectory(url)
                } catch {
                    importError = error.localizedDescription
                }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button(action: { navigator.popToMain() }) {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 11, weight: .semibold))
                    Text("Back")
                        .font(.system(size: 13))
                }
                .foregroundColor(DS.Colors.textSecondary)
            }
            .buttonStyle(.plain)
            .pointerCursor()

            Spacer()

            Text("Skills")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(DS.Colors.textPrimary)

            Spacer()

            Button(action: { showFileImporter = true }) {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(DS.Colors.textPrimary)
                    .frame(width: 24, height: 24)
                    .background(
                        Circle().fill(DS.Colors.accent.opacity(0.2))
                    )
                    .overlay(
                        Circle().stroke(DS.Colors.accent.opacity(0.4), lineWidth: 0.5)
                    )
            }
            .buttonStyle(.plain)
            .pointerCursor()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    // MARK: - Search

    private var searchField: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textTertiary)
            TextField("Search skills", text: $searchText)
                .textFieldStyle(.plain)
                .font(.system(size: 12))
                .foregroundColor(DS.Colors.textPrimary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                .fill(Color.white.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
        )
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    // MARK: - Filtering

    private var filteredSkills: [SkillDefinition] {
        let allSkills = skillManager.installedSkills
        guard !searchText.isEmpty else { return allSkills }
        let lowercased = searchText.lowercased()
        return allSkills.filter {
            $0.metadata.name.lowercased().contains(lowercased) ||
            $0.metadata.targetApp.lowercased().contains(lowercased)
        }
    }

    private var activeSkillsInLibrary: [SkillDefinition] {
        filteredSkills.filter { skill in
            skillManager.activeSkill?.metadata.id == skill.metadata.id ||
            skillManager.isPinned(skill.metadata.id)
        }
    }

    private var idleSkills: [SkillDefinition] {
        filteredSkills.filter { skill in
            skillManager.activeSkill?.metadata.id != skill.metadata.id &&
            !skillManager.isPinned(skill.metadata.id)
        }
    }

    // MARK: - Skill List

    private var skillList: some View {
        VStack(alignment: .leading, spacing: 16) {
            if !activeSkillsInLibrary.isEmpty {
                sectionBlock(title: "ACTIVE (\(activeSkillsInLibrary.count))", skills: activeSkillsInLibrary)
            }
            if !idleSkills.isEmpty {
                sectionBlock(title: "INSTALLED (\(idleSkills.count))", skills: idleSkills)
            }
        }
    }

    private func sectionBlock(title: String, skills: [SkillDefinition]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundColor(DS.Colors.accentText)
                .tracking(0.8)

            VStack(spacing: 4) {
                ForEach(skills, id: \.metadata.id) { skill in
                    skillRow(skill: skill)
                }
            }
        }
    }

    // MARK: - Skill Row

    private func skillRow(skill: SkillDefinition) -> some View {
        let isActive = skillManager.activeSkill?.metadata.id == skill.metadata.id
        let isPinned = skillManager.isPinned(skill.metadata.id)
        let isExpanded = expandedSkillId == skill.metadata.id

        return VStack(spacing: 0) {
            Button(action: {
                withAnimation(.easeInOut(duration: 0.2)) {
                    expandedSkillId = isExpanded ? nil : skill.metadata.id
                }
            }) {
                HStack(spacing: 10) {
                    Circle()
                        .fill(isActive ? DS.Colors.success : (isPinned ? DS.Colors.accentText.opacity(0.5) : Color.white.opacity(0.15)))
                        .frame(width: 8, height: 8)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(skill.metadata.name)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(DS.Colors.textPrimary)
                            .lineLimit(1)

                        Text(skill.metadata.targetApp)
                            .font(.system(size: 11))
                            .foregroundColor(DS.Colors.textTertiary)
                    }

                    Spacer()

                    if isPinned {
                        Image(systemName: "pin.fill")
                            .font(.system(size: 9))
                            .foregroundColor(DS.Colors.accentText)
                    }

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(DS.Colors.textTertiary)
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                        .fill(isActive ? DS.Colors.accentSubtle : Color.white.opacity(0.03))
                )
            }
            .buttonStyle(.plain)
            .pointerCursor()

            if isExpanded {
                skillDetailActions(skill: skill, isActive: isActive, isPinned: isPinned)
                    .padding(.horizontal, 10)
                    .padding(.top, 6)
                    .padding(.bottom, 8)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private func skillDetailActions(skill: SkillDefinition, isActive: Bool, isPinned: Bool) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                actionButton(
                    label: isActive ? "Deactivate" : "Activate",
                    icon: isActive ? "pause.circle" : "play.circle",
                    style: isActive ? .secondary : .primary
                ) {
                    if isActive {
                        skillManager.deactivateSkill()
                    } else {
                        skillManager.activateSkill(skill, isManualSelection: true)
                    }
                }

                actionButton(
                    label: isPinned ? "Unpin" : "Pin",
                    icon: isPinned ? "pin.slash" : "pin",
                    style: .secondary
                ) {
                    skillManager.togglePinned(skill.metadata.id)
                }
            }

            actionButton(
                label: "Remove skill",
                icon: "trash",
                style: .destructive
            ) {
                pendingDeletion = PendingDeletion(id: skill.metadata.id, skillName: skill.metadata.name)
            }
        }
    }

    private enum ButtonStyleVariant {
        case primary, secondary, destructive
    }

    private func actionButton(
        label: String,
        icon: String,
        style: ButtonStyleVariant,
        action: @escaping () -> Void
    ) -> some View {
        let foregroundColor: Color = {
            switch style {
            case .primary: return DS.Colors.textOnAccent
            case .secondary: return DS.Colors.textSecondary
            case .destructive: return DS.Colors.destructiveText
            }
        }()

        let backgroundColor: Color = {
            switch style {
            case .primary: return DS.Colors.accent
            case .secondary: return Color.white.opacity(0.06)
            case .destructive: return DS.Colors.destructive.opacity(0.15)
            }
        }()

        return Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .medium))
            }
            .foregroundColor(foregroundColor)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                    .fill(backgroundColor)
            )
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(searchText.isEmpty ? "No skills installed" : "No skills match “\(searchText)”")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(DS.Colors.textSecondary)
            if searchText.isEmpty {
                Text("Tap the + button above to import your first skill.")
                    .font(.system(size: 11))
                    .foregroundColor(DS.Colors.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                .fill(Color.white.opacity(0.03))
        )
    }
}
