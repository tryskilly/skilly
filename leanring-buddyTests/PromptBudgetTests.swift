// MARK: - SkillSight

import Testing
@testable import leanring_buddy

// MARK: - Test Helpers

/// Constructs a VocabularyEntry with a synthetic description of a given character length.
private func makeVocabularyEntry(name: String, descriptionLength: Int = 100) -> VocabularyEntry {
    VocabularyEntry(name: name, description: String(repeating: "a", count: descriptionLength))
}

/// Constructs a CurriculumStage whose goals contain the provided goal text strings.
private func makeStageWithGoals(_ goalTexts: [String]) -> CurriculumStage {
    CurriculumStage(
        id: "test-stage",
        name: "Test Stage",
        stageNumber: 1,
        description: "Test",
        goals: goalTexts,
        completionSignals: [],
        prerequisites: nil,
        nextStageName: nil
    )
}

// MARK: - PromptBudget Tests

@Suite("PromptBudget")
struct PromptBudgetTests {

    /// When all entries together fit inside the budget, every entry should be returned unchanged.
    @Test func returnsAllEntriesWhenUnderBudget() {
        let entryAlpha = makeVocabularyEntry(name: "alpha", descriptionLength: 20)
        let entryBeta  = makeVocabularyEntry(name: "beta",  descriptionLength: 20)
        let allEntries = [entryAlpha, entryBeta]

        let stage  = makeStageWithGoals(["learn alpha and beta"])
        let budget = 700

        let result = PromptBudget.trimVocabulary(
            entries: allEntries,
            currentStage: stage,
            budget: budget
        )

        #expect(result.count == 2)
    }

    /// When the full list exceeds the budget but a stage-filtered subset fits, only the entries
    /// whose names appear in stage goals should be returned.
    @Test func filtersToStageRelevantEntriesWhenOverBudget() {
        // 5 entries, each ~200 chars of description — total ~1000 chars → ~250 tokens, over budget=200.
        let entryApple  = makeVocabularyEntry(name: "apple",  descriptionLength: 200)
        let entryBanana = makeVocabularyEntry(name: "banana", descriptionLength: 200)
        let entryCherry = makeVocabularyEntry(name: "cherry", descriptionLength: 200)
        let entryDate   = makeVocabularyEntry(name: "date",   descriptionLength: 200)
        let entryElder  = makeVocabularyEntry(name: "elder",  descriptionLength: 200)
        let allEntries  = [entryApple, entryBanana, entryCherry, entryDate, entryElder]

        // Stage goals only mention apple and banana.
        let stage  = makeStageWithGoals(["focus on apple", "also understand banana"])
        let budget = 200

        let result = PromptBudget.trimVocabulary(
            entries: allEntries,
            currentStage: stage,
            budget: budget
        )

        #expect(result.count == 2)
        #expect(result.contains(where: { $0.name == "apple" }))
        #expect(result.contains(where: { $0.name == "banana" }))
    }

    /// When even the stage-relevant subset exceeds the budget, the result should be capped at 5 entries.
    @Test func capsAtFiveEntriesWhenStageRelevantStillOverBudget() {
        // 8 entries, all referenced in goals, each with a long enough description to bust a small budget.
        let entryNames = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"]
        let allEntries = entryNames.map { makeVocabularyEntry(name: $0, descriptionLength: 50) }

        // Goals mention all 8 names.
        let goalText = entryNames.joined(separator: ", ")
        let stage    = makeStageWithGoals([goalText])

        // Budget is tight enough that 8 entries don't fit but ≤5 might (we only check count here).
        let budget = 200

        let result = PromptBudget.trimVocabulary(
            entries: allEntries,
            currentStage: stage,
            budget: budget
        )

        #expect(result.count <= 5)
    }

    /// When even the top-5 stage-relevant entries are too large, vocabulary should be omitted entirely.
    @Test func returnsEmptyWhenTopFiveStillOverBudget() {
        // 5 entries with enormous descriptions (2000 chars each → ~500 tokens each).
        let hugeEntries = ["one", "two", "three", "four", "five"]
            .map { makeVocabularyEntry(name: $0, descriptionLength: 2_000) }

        // Stage goals reference all five.
        let stage  = makeStageWithGoals(["one two three four five"])
        let budget = 100

        let result = PromptBudget.trimVocabulary(
            entries: hugeEntries,
            currentStage: stage,
            budget: budget
        )

        #expect(result.isEmpty)
    }

    /// A 500-character string should estimate to 125 tokens (500 / 4).
    @Test func estimatesTokenCountConservatively() {
        let fiveHundredCharacterString = String(repeating: "x", count: 500)
        let estimatedTokenCount = PromptBudget.estimateTokenCount(fiveHundredCharacterString)
        #expect(estimatedTokenCount == 125)
    }

    /// The sum of all individual budget components must not exceed the declared maximum.
    @Test func totalBudgetComponentsSumToMax() {
        let sumOfAllBudgetComponents =
            PromptBudget.basePromptReserve +
            PromptBudget.teachingInstructionsBudget +
            PromptBudget.curriculumContextBudget +
            PromptBudget.vocabularyBudget +
            PromptBudget.bufferBudget

        #expect(sumOfAllBudgetComponents <= PromptBudget.maxSystemPromptTokens)
    }
}
