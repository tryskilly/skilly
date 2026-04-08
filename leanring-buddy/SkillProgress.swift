// MARK: - Skilly

import Foundation

/// Tracks a user's progress through a single skill, including which stages have been completed,
/// when they started each stage, and how many signal interactions have accumulated per stage.
struct SkillProgress: Codable, Sendable {
    let skillId: String
    var skillVersion: String
    var currentStageId: String
    var completedStageIds: [String]
    var stageStartDates: [String: Date]
    var totalInteractions: Int
    var lastInteractionDate: Date?
    var isManualOverride: Bool

    /// Counts how many signal interactions have occurred in each stage (stageId → count).
    /// Used to determine when the user is ready to advance to the next stage automatically.
    var signalBuffer: [String: Int]

    /// The number of signal interactions required in a stage before automatic advancement is triggered.
    static let defaultAdvancementThreshold = 3

    // MARK: - Factory

    /// Creates a brand-new SkillProgress for a skill, placing the user at the first stage
    /// with no completed stages, no signal interactions, and no manual override.
    static func createNew(
        skillId: String,
        skillVersion: String,
        firstStageId: String
    ) -> SkillProgress {
        SkillProgress(
            skillId: skillId,
            skillVersion: skillVersion,
            currentStageId: firstStageId,
            completedStageIds: [],
            stageStartDates: [firstStageId: Date()],
            totalInteractions: 0,
            lastInteractionDate: nil,
            isManualOverride: false,
            signalBuffer: [:]
        )
    }

    // MARK: - Migration

    /// Returns true when the stored skill version no longer matches the current version of the skill definition.
    /// This signals that the skill file has been updated and stored progress may need to be migrated.
    func needsMigration(currentSkillVersion: String) -> Bool {
        skillVersion != currentSkillVersion
    }

    /// Migrates stored progress to a new set of stage IDs by mapping positions.
    ///
    /// Each completed stage in the old list is mapped to the stage at the same index in the new list.
    /// The current stage is similarly mapped by its index in the old list. If no positional match is
    /// found (e.g. the old list was longer), progress resets to the first stage in the new list.
    /// The signal buffer is cleared and manual override is reset so the automatic advancement
    /// logic starts fresh under the new stage layout.
    func migrateByPosition(
        oldStageIds: [String],
        newStageIds: [String],
        newSkillVersion: String
    ) -> SkillProgress {
        // Map each completed old stageId to the new stageId at the same position.
        let migratedCompletedStageIds: [String] = completedStageIds.compactMap { oldStageId in
            guard let oldIndex = oldStageIds.firstIndex(of: oldStageId),
                  oldIndex < newStageIds.count else {
                return nil
            }
            return newStageIds[oldIndex]
        }

        // Map the current stage by position. Fall back to the first new stage if no match.
        let migratedCurrentStageId: String = {
            if let oldCurrentIndex = oldStageIds.firstIndex(of: currentStageId),
               oldCurrentIndex < newStageIds.count {
                return newStageIds[oldCurrentIndex]
            }
            return newStageIds.first ?? currentStageId
        }()

        return SkillProgress(
            skillId: skillId,
            skillVersion: newSkillVersion,
            currentStageId: migratedCurrentStageId,
            completedStageIds: migratedCompletedStageIds,
            stageStartDates: stageStartDates,
            totalInteractions: totalInteractions,
            lastInteractionDate: lastInteractionDate,
            isManualOverride: false,
            signalBuffer: [:]
        )
    }
}
