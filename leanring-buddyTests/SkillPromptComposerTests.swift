// MARK: - SkillSight

import Testing
@testable import leanring_buddy

struct SkillPromptComposerTests {

    private let basePrompt = "you're clicky, a friendly companion."

    /// Parses the shared minimal skill fixture and creates a fresh SkillProgress at stage 1.
    private func makeSkillAndProgress() throws -> (SkillDefinition, SkillProgress) {
        let skill = try SkillDefinition.parse(from: SkillDefinitionParserTests.minimalSkillMarkdown)
        let progress = SkillProgress.createNew(
            skillId: skill.metadata.id,
            skillVersion: skill.metadata.version,
            firstStageId: skill.curriculumStages[0].id
        )
        return (skill, progress)
    }

    // MARK: Test 1

    @Test func composedPromptStartsWithBasePrompt() throws {
        let (skill, progress) = try makeSkillAndProgress()
        let composedPrompt = SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: skill,
            progress: progress
        )

        #expect(composedPrompt.hasPrefix(basePrompt))
    }

    // MARK: Test 2

    @Test func composedPromptContainsTeachingInstructions() throws {
        let (skill, progress) = try makeSkillAndProgress()
        let composedPrompt = SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: skill,
            progress: progress
        )

        // The teaching instructions top-level prose must appear in the output.
        #expect(composedPrompt.contains("You are teaching TestApp basics."))

        // Nested H3 headings within the teaching instructions must also be present.
        #expect(composedPrompt.contains("### Your Expertise"))
    }

    // MARK: Test 3

    @Test func composedPromptContainsCurrentStageContext() throws {
        let (skill, progress) = try makeSkillAndProgress()
        let composedPrompt = SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: skill,
            progress: progress
        )

        // The current stage name must be visible in the learning progress block.
        #expect(composedPrompt.contains("First Steps"))

        // The stage goals must also be listed.
        #expect(composedPrompt.contains("Open the app"))
        #expect(composedPrompt.contains("Find the main menu"))
    }

    // MARK: Test 4

    @Test func composedPromptContainsVocabularyEntries() throws {
        let (skill, progress) = try makeSkillAndProgress()
        let composedPrompt = SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: skill,
            progress: progress
        )

        // Both vocabulary entries from the fixture must appear in the vocabulary block.
        #expect(composedPrompt.contains("Main Menu"))
        #expect(composedPrompt.contains("Sidebar"))
    }

    // MARK: Test 5

    @Test func composedPromptContainsAlwaysPointingInstruction() throws {
        // The fixture skill uses pointing_mode: always, so the "aggressively point" instruction
        // must appear in the composed output.
        let (skill, progress) = try makeSkillAndProgress()
        let composedPrompt = SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: skill,
            progress: progress
        )

        #expect(composedPrompt.contains("aggressively point"))
    }

    // MARK: Test 6

    @Test func composedPromptShowsCompletedStages() throws {
        let (skill, var progress) = try makeSkillAndProgress()

        // Simulate having completed stage 1 and advanced to stage 2.
        let firstStageId = skill.curriculumStages[0].id
        let secondStageId = skill.curriculumStages[1].id

        progress.completedStageIds = [firstStageId]
        progress.currentStageId = secondStageId

        let composedPrompt = SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: skill,
            progress: progress
        )

        // The completed stages header and the name of the first stage must both appear.
        #expect(composedPrompt.contains("Completed stages:"))
        #expect(composedPrompt.contains("First Steps"))
    }

    // MARK: Test 7

    @Test func promptCacheReturnsIdenticalResultForSameState() throws {
        let (skill, progress) = try makeSkillAndProgress()
        var promptCache = PromptCache()

        let firstComposedPrompt = SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: skill,
            progress: progress,
            cache: &promptCache
        )

        let secondComposedPrompt = SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: skill,
            progress: progress,
            cache: &promptCache
        )

        // Identical skill/stage state must produce byte-for-byte identical prompts.
        #expect(firstComposedPrompt == secondComposedPrompt)
    }

    // MARK: Test 8

    @Test func promptCacheInvalidatesOnStageChange() throws {
        let (skill, var progress) = try makeSkillAndProgress()
        var promptCache = PromptCache()

        // Compose a prompt for stage 1.
        let promptForStageOne = SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: skill,
            progress: progress,
            cache: &promptCache
        )

        // Advance to stage 2 and compose again.
        let secondStageId = skill.curriculumStages[1].id
        progress.completedStageIds = [skill.curriculumStages[0].id]
        progress.currentStageId = secondStageId

        let promptForStageTwo = SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: skill,
            progress: progress,
            cache: &promptCache
        )

        // Changing the stage must produce a different prompt, proving the cache invalidated.
        #expect(promptForStageOne != promptForStageTwo)
    }
}
