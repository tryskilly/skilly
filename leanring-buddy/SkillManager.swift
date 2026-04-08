// MARK: - SkillSight

import SwiftUI

/// Central coordinator for all SkillSight functionality.
///
/// SkillManager owns the active skill state, delegates curriculum processing to
/// CurriculumEngine, persists progress and config via SkillStore, and composes
/// the layered system prompt that gets injected into CompanionManager.
@MainActor
final class SkillManager: ObservableObject {

    // MARK: - Published State

    /// All skills currently installed in ~/.skillsight/skills/.
    @Published private(set) var installedSkills: [SkillDefinition] = []

    /// The skill the user has chosen to practice, or nil when no skill is active.
    @Published private(set) var activeSkill: SkillDefinition?

    /// The learner's current progress through the active skill, or nil when no skill is active.
    @Published private(set) var activeSkillProgress: SkillProgress?

    /// When true, skill-augmented prompts are suppressed even if a skill is active.
    /// The user can pause without fully deactivating the skill.
    @Published private(set) var isSkillPaused: Bool = false

    // MARK: - Dependencies

    /// Processes voice interactions to detect mastery signals and advance curriculum stages.
    let curriculumEngine = CurriculumEngine()

    private let store: SkillStore

    /// Holds the most-recently composed system prompt alongside its cache key so we
    /// can skip recomposition when the active skill and stage have not changed.
    private var promptCache = PromptCache()

    // MARK: - Init

    init(store: SkillStore = SkillStore()) {
        self.store = store
    }

    // MARK: - Loading

    /// Scans the skills directory, loads all installed skills, and restores the previously
    /// active skill from the persisted config.
    func loadInstalledSkills() {
        store.ensureDirectoriesExist()

        do {
            let loadedSkills = try store.loadInstalledSkills()
            installedSkills = loadedSkills
            print("[SkillManager] Loaded \(loadedSkills.count) installed skill(s).")

            // Restore the previously active skill so the user's session continues seamlessly.
            let savedConfig = (try? store.loadConfig()) ?? .default
            if let savedActiveSkillId = savedConfig.activeSkillId,
               let matchingSkill = loadedSkills.first(where: { $0.metadata.id == savedActiveSkillId }) {
                // Activate silently — no need to re-persist what is already persisted.
                activateSkill(matchingSkill)
            }
        } catch {
            print("[SkillManager] Warning: Failed to load installed skills — \(error)")
        }
    }

    // MARK: - Activation

    /// Makes the given skill active, loading or creating progress and handling version mismatches.
    ///
    /// If stored progress exists but has a version mismatch, we attempt a lightweight migration:
    /// when the stored stage IDs are still a subset of the new skill's stages we simply bump
    /// the version rather than resetting all progress.
    func activateSkill(_ skill: SkillDefinition) {
        activeSkill = skill
        isSkillPaused = false
        promptCache = PromptCache()

        // Load existing progress, or create fresh progress if none exists yet.
        var resolvedProgress: SkillProgress
        do {
            if var existingProgress = try store.loadProgress(skillId: skill.metadata.id) {
                if existingProgress.needsMigration(currentSkillVersion: skill.metadata.version) {
                    let newStageIds = skill.curriculumStages.map { $0.id }
                    let oldStageIds = existingProgress.completedStageIds + [existingProgress.currentStageId]

                    // If all old stage IDs still exist in the new skill, do a lightweight version bump
                    // rather than a destructive positional migration — the user's placement is intact.
                    let allOldStageIdsStillValid = oldStageIds.allSatisfy { newStageIds.contains($0) }
                    if allOldStageIdsStillValid {
                        existingProgress.skillVersion = skill.metadata.version
                        resolvedProgress = existingProgress
                        print("[SkillManager] Bumped skill version to \(skill.metadata.version) — stage IDs unchanged.")
                    } else {
                        resolvedProgress = existingProgress.migrateByPosition(
                            oldStageIds: oldStageIds,
                            newStageIds: newStageIds,
                            newSkillVersion: skill.metadata.version
                        )
                        print("[SkillManager] Migrated progress by position to skill version \(skill.metadata.version).")
                    }
                } else {
                    resolvedProgress = existingProgress
                }
            } else {
                // No saved progress — start the learner at the very first stage.
                let firstStageId = skill.curriculumStages.first?.id ?? ""
                resolvedProgress = SkillProgress.createNew(
                    skillId: skill.metadata.id,
                    skillVersion: skill.metadata.version,
                    firstStageId: firstStageId
                )
            }
        } catch {
            print("[SkillManager] Warning: Could not load progress for '\(skill.metadata.id)' — creating new. Error: \(error)")
            let firstStageId = skill.curriculumStages.first?.id ?? ""
            resolvedProgress = SkillProgress.createNew(
                skillId: skill.metadata.id,
                skillVersion: skill.metadata.version,
                firstStageId: firstStageId
            )
        }

        activeSkillProgress = resolvedProgress
        persistActiveSkillId(skill.metadata.id)
    }

    /// Clears the active skill and all related state.
    func deactivateSkill() {
        activeSkill = nil
        activeSkillProgress = nil
        isSkillPaused = false
        promptCache = PromptCache()
        persistActiveSkillId(nil)
    }

    /// Temporarily suppresses skill-augmented prompts without losing the active skill or progress.
    func pauseSkill() {
        isSkillPaused = true
    }

    /// Re-enables skill-augmented prompts after a pause.
    func resumeSkill() {
        isSkillPaused = false
    }

    // MARK: - Prompt Composition

    /// Returns the layered system prompt for the active skill, or nil when no skill is active or the
    /// skill is paused. Results are served from an in-memory cache when the skill and stage are unchanged.
    ///
    /// - Parameter basePrompt: The static system prompt that always appears first (Clicky's core identity).
    /// - Returns: The composed prompt string, or nil if no skill augmentation should be applied.
    func composedSystemPrompt(basePrompt: String) -> String? {
        guard !isSkillPaused,
              let currentActiveSkill = activeSkill,
              let currentActiveProgress = activeSkillProgress else {
            return nil
        }

        return SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: currentActiveSkill,
            progress: currentActiveProgress,
            cache: &promptCache
        )
    }

    // MARK: - Curriculum Interaction

    /// Processes a completed voice interaction through the curriculum engine.
    ///
    /// If the engine advances the learner to a new stage, the prompt cache is invalidated
    /// so the next call to composedSystemPrompt reflects the new curriculum context.
    func didReceiveInteraction(transcript: String, assistantResponse: String) {
        guard let currentActiveSkill = activeSkill,
              let currentActiveProgress = activeSkillProgress else {
            return
        }

        let stageIdBeforeInteraction = currentActiveProgress.currentStageId

        let updatedProgress = curriculumEngine.processInteraction(
            transcript: transcript,
            assistantResponse: assistantResponse,
            skill: currentActiveSkill,
            progress: currentActiveProgress
        )

        activeSkillProgress = updatedProgress
        saveProgressToDisk(updatedProgress)

        // Invalidate the prompt cache when the stage advanced so the next prompt reflects
        // the learner's new position in the curriculum.
        if updatedProgress.currentStageId != stageIdBeforeInteraction {
            promptCache = PromptCache()
        }
    }

    /// Manually places the learner on a specific stage, bypassing signal accumulation.
    func manuallySetCurrentStage(stageId: String) {
        guard let currentActiveProgress = activeSkillProgress else { return }

        let updatedProgress = curriculumEngine.manuallySetStage(
            stageId: stageId,
            progress: currentActiveProgress
        )

        activeSkillProgress = updatedProgress
        saveProgressToDisk(updatedProgress)
        promptCache = PromptCache()
    }

    /// Explicitly marks a stage as complete and advances the learner if appropriate.
    func markStageComplete(stageId: String) {
        guard let currentActiveSkill = activeSkill,
              let currentActiveProgress = activeSkillProgress else {
            return
        }

        let updatedProgress = curriculumEngine.markStageComplete(
            stageId: stageId,
            skill: currentActiveSkill,
            progress: currentActiveProgress
        )

        activeSkillProgress = updatedProgress
        saveProgressToDisk(updatedProgress)
        promptCache = PromptCache()
    }

    /// Resets all learner progress for the active skill back to the first stage.
    func resetProgress() {
        guard let currentActiveSkill = activeSkill,
              let currentActiveProgress = activeSkillProgress else {
            return
        }

        let firstStageId = currentActiveSkill.curriculumStages.first?.id ?? ""
        let resetSkillProgress = curriculumEngine.resetProgress(
            progress: currentActiveProgress,
            firstStageId: firstStageId
        )

        activeSkillProgress = resetSkillProgress
        saveProgressToDisk(resetSkillProgress)
        promptCache = PromptCache()
    }

    // MARK: - Entitlements

    /// Returns whether the user is entitled to access the given skill.
    /// Phase 1: all installed skills are freely accessible.
    func canAccessSkill(_ skill: SkillDefinition) -> Bool {
        return true
    }

    // MARK: - Private Helpers

    /// Saves the given progress to disk, printing a warning on failure rather than crashing.
    private func saveProgressToDisk(_ progress: SkillProgress) {
        do {
            try store.saveProgress(progress)
        } catch {
            print("[SkillManager] Warning: Could not save progress for '\(progress.skillId)' — \(error)")
        }
    }

    /// Persists the active skill ID (or nil for no active skill) to the app config file.
    private func persistActiveSkillId(_ skillId: String?) {
        do {
            var currentConfig = (try? store.loadConfig()) ?? .default
            currentConfig.activeSkillId = skillId
            try store.saveConfig(currentConfig)
        } catch {
            print("[SkillManager] Warning: Could not persist active skill ID — \(error)")
        }
    }
}
