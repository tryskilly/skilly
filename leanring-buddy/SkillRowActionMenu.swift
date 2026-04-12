// MARK: - Skilly
//
//  SkillRowActionMenu.swift
//  leanring-buddy
//
//  The overflow (⋯) action menu shown on skill rows. Revealed on hover
//  or right-click. Groups safe actions above a divider from the
//  destructive "Remove skill" action.
//
//  Pause/Resume toggles based on current state. Installed (inactive)
//  skills get "Activate" instead of Pause.
//

import SwiftUI

struct SkillRowActionMenu: View {
    let skill: SkillDefinition
    let skillManager: SkillManager
    let isActive: Bool
    let isPaused: Bool

    /// Fires when the user chooses Remove — parent shows the confirmation alert.
    var onRemoveRequested: () -> Void

    var body: some View {
        Menu {
            // Top action: context-dependent
            if isActive {
                if isPaused {
                    Button(action: resumeSkill) {
                        Label("Resume", systemImage: "play.circle")
                    }
                } else {
                    Button(action: pauseSkill) {
                        Label("Pause", systemImage: "pause.circle")
                    }
                }
            } else {
                Button(action: activateSkill) {
                    Label("Activate", systemImage: "play.circle")
                }
            }

            // Reset progress only makes sense for skills that have been started
            if isActive {
                Button(action: resetProgress) {
                    Label("Reset progress", systemImage: "arrow.counterclockwise")
                }
            }

            Button(action: viewDetails) {
                Label("View details", systemImage: "info.circle")
            }

            Button(action: showInFinder) {
                Label("Show in Finder", systemImage: "folder")
            }

            Divider()

            Button(role: .destructive, action: onRemoveRequested) {
                Label("Remove skill", systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(DS.Colors.textTertiary)
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
    }

    // MARK: - Actions

    private func activateSkill() {
        skillManager.activateSkill(skill, isManualSelection: true)
    }

    private func pauseSkill() {
        skillManager.pauseSkill()
    }

    private func resumeSkill() {
        skillManager.resumeSkill()
    }

    private func resetProgress() {
        skillManager.resetProgress()
    }

    private func viewDetails() {
        guard let path = skill.sourceDirectoryPath else { return }
        let skillMdURL = URL(fileURLWithPath: path).appendingPathComponent("SKILL.md")
        NSWorkspace.shared.open(skillMdURL)
    }

    private func showInFinder() {
        guard let path = skill.sourceDirectoryPath else { return }
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
    }
}
