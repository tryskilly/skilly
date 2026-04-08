// MARK: - Skilly

import Foundation

/// Processes voice interactions against a skill's curriculum to detect mastery signals
/// and automatically advance the learner through stages.
///
/// CurriculumEngine is stateless — all mutable state lives in SkillProgress values
/// that are passed in and returned as updated copies.
final class CurriculumEngine: Sendable {

    // MARK: - Signal Detection

    /// Returns true if the combined transcript and assistant response text contains
    /// at least one of the stage's completion signal keywords (case-insensitive).
    ///
    /// The transcript and assistantResponse are concatenated before matching so that
    /// a signal appearing in either source is detected.
    static func transcriptContainsCompletionSignal(
        transcript: String,
        assistantResponse: String,
        stage: CurriculumStage
    ) -> Bool {
        let combinedText = (transcript + " " + assistantResponse).lowercased()

        return stage.completionSignals.contains { signalKeyword in
            combinedText.contains(signalKeyword.lowercased())
        }
    }

    // MARK: - Interaction Processing

    /// Processes a single voice interaction against the skill's curriculum,
    /// updating the signal buffer and potentially advancing the stage.
    ///
    /// Steps:
    /// 1. Increment totalInteractions.
    /// 2. Record lastInteractionDate.
    /// 3. Find the current stage in the skill's curriculum.
    /// 4. Check for completion signals in the transcript + response.
    /// 5. If a signal is found, increment signalBuffer for the current stage.
    /// 6. If the buffer reaches defaultAdvancementThreshold, advance to the next stage.
    /// 7. Return the updated progress.
    func processInteraction(
        transcript: String,
        assistantResponse: String,
        skill: SkillDefinition,
        progress: SkillProgress
    ) -> SkillProgress {
        var updatedProgress = progress

        // Step 1 & 2: Record that an interaction occurred.
        updatedProgress.totalInteractions += 1
        updatedProgress.lastInteractionDate = Date()

        // Step 3: Find the stage the learner is currently on.
        let currentStageId = updatedProgress.currentStageId
        guard let currentStage = skill.curriculumStages.first(where: { $0.id == currentStageId }) else {
            // If the current stage ID is not found in the skill, return the progress unchanged
            // (apart from the interaction count and date already updated above).
            return updatedProgress
        }

        // Step 4: Check whether this interaction contains a completion signal for the current stage.
        let interactionContainsCompletionSignal = CurriculumEngine.transcriptContainsCompletionSignal(
            transcript: transcript,
            assistantResponse: assistantResponse,
            stage: currentStage
        )

        guard interactionContainsCompletionSignal else {
            // No signal detected — return progress with only the interaction count / date updated.
            return updatedProgress
        }

        // Step 5: A signal was found — increment the signal buffer for the current stage.
        // Multiple keywords in a single interaction still count as exactly one signal.
        let previousSignalCount = updatedProgress.signalBuffer[currentStageId] ?? 0
        let newSignalCount = previousSignalCount + 1
        updatedProgress.signalBuffer[currentStageId] = newSignalCount

        // Step 6: Check whether the buffer has reached the threshold for automatic advancement.
        if newSignalCount >= SkillProgress.defaultAdvancementThreshold {
            updatedProgress = advanceStage(skill: skill, progress: updatedProgress)
        }

        return updatedProgress
    }

    // MARK: - Private Stage Advancement

    /// Advances the learner from the current stage to the next stage in the curriculum.
    ///
    /// Steps:
    /// 1. Add currentStageId to completedStageIds (if not already present).
    /// 2. Clear the signal buffer entry for the completed stage.
    /// 3. Clear the isManualOverride flag.
    /// 4. Look up the next stage via currentStage.nextStageName → CurriculumStage.idFromName.
    /// 5. If a next stage is found, update currentStageId and record its start date.
    private func advanceStage(skill: SkillDefinition, progress: SkillProgress) -> SkillProgress {
        var updatedProgress = progress
        let completedStageId = updatedProgress.currentStageId

        // Step 1: Mark the current stage as completed if not already listed.
        if !updatedProgress.completedStageIds.contains(completedStageId) {
            updatedProgress.completedStageIds.append(completedStageId)
        }

        // Step 2: Clear the signal buffer for the stage that was just completed.
        updatedProgress.signalBuffer.removeValue(forKey: completedStageId)

        // Step 3: Clear any manual override flag — this advancement was automatic.
        updatedProgress.isManualOverride = false

        // Step 4: Resolve the next stage by name → id → lookup in the skill's stage list.
        let completedStage = skill.curriculumStages.first(where: { $0.id == completedStageId })
        if let nextStageName = completedStage?.nextStageName {
            let nextStageId = CurriculumStage.idFromName(nextStageName)
            if let _ = skill.curriculumStages.first(where: { $0.id == nextStageId }) {
                // Step 5: Transition to the next stage and record when it was started.
                updatedProgress.currentStageId = nextStageId
                updatedProgress.stageStartDates[nextStageId] = Date()
            }
        }

        return updatedProgress
    }

    // MARK: - Manual Controls

    /// Manually places the learner on a specific stage, bypassing signal accumulation.
    ///
    /// Sets isManualOverride to true and clears any existing signal buffer for the
    /// target stage so the learner starts accumulating fresh signals.
    func manuallySetStage(stageId: String, progress: SkillProgress) -> SkillProgress {
        var updatedProgress = progress
        updatedProgress.currentStageId = stageId
        updatedProgress.isManualOverride = true
        updatedProgress.signalBuffer.removeValue(forKey: stageId)
        updatedProgress.stageStartDates[stageId] = Date()
        return updatedProgress
    }

    /// Marks a specific stage as complete, clears its signal buffer,
    /// and advances to the next stage if the completed stage is the current one.
    func markStageComplete(
        stageId: String,
        skill: SkillDefinition,
        progress: SkillProgress
    ) -> SkillProgress {
        var updatedProgress = progress

        // Add the stage to the completed list if not already there.
        if !updatedProgress.completedStageIds.contains(stageId) {
            updatedProgress.completedStageIds.append(stageId)
        }

        // Clear the signal buffer for the explicitly completed stage.
        updatedProgress.signalBuffer.removeValue(forKey: stageId)

        // If the completed stage is the current one, advance to the next stage.
        if updatedProgress.currentStageId == stageId {
            updatedProgress = advanceStage(skill: skill, progress: updatedProgress)
        }

        return updatedProgress
    }

    /// Resets all learner progress for a skill, returning a fresh SkillProgress
    /// at the given first stage while preserving the skillId and skillVersion.
    func resetProgress(progress: SkillProgress, firstStageId: String) -> SkillProgress {
        return SkillProgress.createNew(
            skillId: progress.skillId,
            skillVersion: progress.skillVersion,
            firstStageId: firstStageId
        )
    }
}
