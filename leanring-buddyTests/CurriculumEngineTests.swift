// MARK: - SkillSight

import Testing
import Foundation
@testable import leanring_buddy

// MARK: - SkillDefinitionParserTests

/// Shared test fixtures for SkillDefinition parsing tests.
/// Defined here so CurriculumEngineTests can reference minimalSkillMarkdown.
struct SkillDefinitionParserTests {

    /// A minimal but complete SKILL.md fixture with two curriculum stages used across multiple test files.
    ///
    /// Stage 1: "First Steps" — signals: open, menu, basics. Next: "Advanced Steps"
    /// Stage 2: "Advanced Steps" — signals: advanced, feature. Next: null
    static let minimalSkillMarkdown = """
    ---
    id: test-skill
    name: Test Skill
    version: 1.0.0
    format_version: 1.0
    min_runtime_version: 1.0.0
    author: Test Author
    license: MIT
    target_app: TestApp
    bundle_id: com.example.testapp
    platform: macOS
    category: productivity
    ---

    A minimal skill for testing purposes.

    ## Teaching Instructions

    Help the user learn the basics and then advanced features.

    ## Curriculum

    ### Stage 1: First Steps

    Get familiar with the basic controls and navigation.

    **Goals:**
    - Understand the menu
    - Open the main view

    **Completion signals:** open, menu, basics
    **Next:** Advanced Steps

    ### Stage 2: Advanced Steps

    Explore advanced features and workflows.

    **Goals:**
    - Use advanced features

    **Completion signals:** advanced, feature
    **Next:** null
    """
}

// MARK: - CurriculumEngineTests

struct CurriculumEngineTests {

    // MARK: - Helpers

    /// Parses and returns the two-stage test skill from minimalSkillMarkdown.
    private func makeTwoStageSkill() throws -> SkillDefinition {
        try SkillDefinition.parse(from: SkillDefinitionParserTests.minimalSkillMarkdown)
    }

    private func makeEngine() -> CurriculumEngine { CurriculumEngine() }

    // MARK: - Test 1

    @Test func detectsCompletionSignalInTranscript() throws {
        let testSkill = try makeTwoStageSkill()
        let firstStage = testSkill.curriculumStages[0]

        let signalWasDetected = CurriculumEngine.transcriptContainsCompletionSignal(
            transcript: "I figured out how to open the main menu",
            assistantResponse: "",
            stage: firstStage
        )

        #expect(signalWasDetected == true)
    }

    // MARK: - Test 2

    @Test func detectsCompletionSignalInAssistantResponse() throws {
        let testSkill = try makeTwoStageSkill()
        let firstStage = testSkill.curriculumStages[0]

        let signalWasDetected = CurriculumEngine.transcriptContainsCompletionSignal(
            transcript: "what do I do next",
            assistantResponse: "great, you've got the basics down",
            stage: firstStage
        )

        #expect(signalWasDetected == true)
    }

    // MARK: - Test 3

    @Test func doesNotDetectSignalWhenNoKeywordsMatch() throws {
        let testSkill = try makeTwoStageSkill()
        let firstStage = testSkill.curriculumStages[0]

        let signalWasDetected = CurriculumEngine.transcriptContainsCompletionSignal(
            transcript: "hello how are you",
            assistantResponse: "",
            stage: firstStage
        )

        #expect(signalWasDetected == false)
    }

    // MARK: - Test 4

    @Test func caseInsensitiveSignalMatching() throws {
        let testSkill = try makeTwoStageSkill()
        let firstStage = testSkill.curriculumStages[0]

        let signalWasDetected = CurriculumEngine.transcriptContainsCompletionSignal(
            transcript: "I used the MENU already",
            assistantResponse: "",
            stage: firstStage
        )

        #expect(signalWasDetected == true)
    }

    // MARK: - Test 5

    @Test func incrementsSignalBufferOnSignalDetection() throws {
        let testSkill = try makeTwoStageSkill()
        let engine = makeEngine()
        let firstStageId = testSkill.curriculumStages[0].id

        let initialProgress = SkillProgress.createNew(
            skillId: testSkill.metadata.id,
            skillVersion: testSkill.metadata.version,
            firstStageId: firstStageId
        )

        let updatedProgress = engine.processInteraction(
            transcript: "I opened the menu",
            assistantResponse: "",
            skill: testSkill,
            progress: initialProgress
        )

        #expect(updatedProgress.signalBuffer[firstStageId] == 1)
        #expect(updatedProgress.totalInteractions == 1)
    }

    // MARK: - Test 6

    @Test func doesNotIncrementBufferWhenNoSignalDetected() throws {
        let testSkill = try makeTwoStageSkill()
        let engine = makeEngine()
        let firstStageId = testSkill.curriculumStages[0].id

        let initialProgress = SkillProgress.createNew(
            skillId: testSkill.metadata.id,
            skillVersion: testSkill.metadata.version,
            firstStageId: firstStageId
        )

        let updatedProgress = engine.processInteraction(
            transcript: "hello there",
            assistantResponse: "",
            skill: testSkill,
            progress: initialProgress
        )

        #expect(updatedProgress.signalBuffer[firstStageId] == nil)
        #expect(updatedProgress.totalInteractions == 1)
    }

    // MARK: - Test 7

    @Test func multipleKeywordsInOneInteractionCountAsOne() throws {
        let testSkill = try makeTwoStageSkill()
        let engine = makeEngine()
        let firstStageId = testSkill.curriculumStages[0].id

        let initialProgress = SkillProgress.createNew(
            skillId: testSkill.metadata.id,
            skillVersion: testSkill.metadata.version,
            firstStageId: firstStageId
        )

        // This transcript contains "open", "menu", AND "basics" — all three signals —
        // but a single interaction should only add 1 to the buffer, not 3.
        let updatedProgress = engine.processInteraction(
            transcript: "I can open the menu and I know the basics",
            assistantResponse: "",
            skill: testSkill,
            progress: initialProgress
        )

        #expect(updatedProgress.signalBuffer[firstStageId] == 1)
    }

    // MARK: - Test 8

    @Test func advancesStageAfterThreeSignalInteractions() throws {
        let testSkill = try makeTwoStageSkill()
        let engine = makeEngine()
        let firstStageId = testSkill.curriculumStages[0].id
        let secondStageId = testSkill.curriculumStages[1].id

        var currentProgress = SkillProgress.createNew(
            skillId: testSkill.metadata.id,
            skillVersion: testSkill.metadata.version,
            firstStageId: firstStageId
        )

        // Process three signal-containing interactions to hit the advancement threshold.
        for _ in 1...3 {
            currentProgress = engine.processInteraction(
                transcript: "I opened the menu",
                assistantResponse: "",
                skill: testSkill,
                progress: currentProgress
            )
        }

        #expect(currentProgress.currentStageId == secondStageId)
        #expect(currentProgress.completedStageIds.contains(firstStageId))
        // The signal buffer for the completed stage should be cleared after advancement.
        #expect(currentProgress.signalBuffer[firstStageId] == nil)
    }

    // MARK: - Test 9

    @Test func doesNotAdvanceBeforeThreshold() throws {
        let testSkill = try makeTwoStageSkill()
        let engine = makeEngine()
        let firstStageId = testSkill.curriculumStages[0].id

        var currentProgress = SkillProgress.createNew(
            skillId: testSkill.metadata.id,
            skillVersion: testSkill.metadata.version,
            firstStageId: firstStageId
        )

        // Process only two signal-containing interactions — one short of the threshold.
        for _ in 1...2 {
            currentProgress = engine.processInteraction(
                transcript: "I opened the menu",
                assistantResponse: "",
                skill: testSkill,
                progress: currentProgress
            )
        }

        #expect(currentProgress.currentStageId == firstStageId)
        #expect(currentProgress.signalBuffer[firstStageId] == 2)
    }

    // MARK: - Test 10

    @Test func manualOverrideSetsStageAndResetsBuffer() throws {
        let testSkill = try makeTwoStageSkill()
        let engine = makeEngine()
        let firstStageId = testSkill.curriculumStages[0].id
        let secondStageId = testSkill.curriculumStages[1].id

        // Start at stage 1 with some signal buffer already accumulated.
        var initialProgress = SkillProgress.createNew(
            skillId: testSkill.metadata.id,
            skillVersion: testSkill.metadata.version,
            firstStageId: firstStageId
        )
        initialProgress.signalBuffer[secondStageId] = 2

        let overriddenProgress = engine.manuallySetStage(
            stageId: secondStageId,
            progress: initialProgress
        )

        #expect(overriddenProgress.currentStageId == secondStageId)
        #expect(overriddenProgress.isManualOverride == true)
        // The buffer for stage 2 should be cleared by the manual override.
        #expect(overriddenProgress.signalBuffer[secondStageId] == nil)
    }

    // MARK: - Test 11

    @Test func manualOverridePreventsAutoAdvanceUntilSignalsReaccumulate() throws {
        let testSkill = try makeTwoStageSkill()
        let engine = makeEngine()
        let firstStageId = testSkill.curriculumStages[0].id
        let secondStageId = testSkill.curriculumStages[1].id

        let initialProgress = SkillProgress.createNew(
            skillId: testSkill.metadata.id,
            skillVersion: testSkill.metadata.version,
            firstStageId: firstStageId
        )

        // Manually override back to stage 1.
        var currentProgress = engine.manuallySetStage(
            stageId: firstStageId,
            progress: initialProgress
        )
        #expect(currentProgress.isManualOverride == true)

        // Process two signal interactions — should not advance (threshold is 3).
        for _ in 1...2 {
            currentProgress = engine.processInteraction(
                transcript: "I opened the menu",
                assistantResponse: "",
                skill: testSkill,
                progress: currentProgress
            )
        }
        #expect(currentProgress.currentStageId == firstStageId)
        #expect(currentProgress.signalBuffer[firstStageId] == 2)

        // Process the third signal interaction — should advance and clear the override flag.
        currentProgress = engine.processInteraction(
            transcript: "I opened the menu",
            assistantResponse: "",
            skill: testSkill,
            progress: currentProgress
        )

        #expect(currentProgress.currentStageId == secondStageId)
        #expect(currentProgress.isManualOverride == false)
    }

    // MARK: - Test 12

    @Test func resetProgressClearsEverything() throws {
        let testSkill = try makeTwoStageSkill()
        let engine = makeEngine()
        let firstStageId = testSkill.curriculumStages[0].id
        let secondStageId = testSkill.curriculumStages[1].id

        // Build up some progress to be reset.
        let progressWithHistory = SkillProgress(
            skillId: testSkill.metadata.id,
            skillVersion: testSkill.metadata.version,
            currentStageId: secondStageId,
            completedStageIds: [firstStageId],
            stageStartDates: [firstStageId: Date(), secondStageId: Date()],
            totalInteractions: 5,
            lastInteractionDate: Date(),
            isManualOverride: true,
            signalBuffer: [secondStageId: 2]
        )

        let resetProgress = engine.resetProgress(
            progress: progressWithHistory,
            firstStageId: firstStageId
        )

        // skillId and skillVersion must be preserved.
        #expect(resetProgress.skillId == testSkill.metadata.id)
        #expect(resetProgress.skillVersion == testSkill.metadata.version)

        // Everything else must be cleared back to initial state.
        #expect(resetProgress.currentStageId == firstStageId)
        #expect(resetProgress.completedStageIds.isEmpty)
        #expect(resetProgress.totalInteractions == 0)
        #expect(resetProgress.lastInteractionDate == nil)
        #expect(resetProgress.isManualOverride == false)
        #expect(resetProgress.signalBuffer.isEmpty)
    }
}
