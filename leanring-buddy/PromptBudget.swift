// MARK: - SkillSight

/// Namespace for token budget constants and helpers used when assembling the Claude system prompt.
/// Keeps the total system prompt within `maxSystemPromptTokens` so we never waste context window space.
enum PromptBudget {

    // MARK: - Budget Constants

    /// Hard ceiling for the entire system prompt in estimated tokens.
    static let maxSystemPromptTokens = 6_000

    /// Reserved headroom for the static preamble and dynamic app-state fields.
    static let basePromptReserve = 800

    /// Budget allocated to the teaching instructions block.
    static let teachingInstructionsBudget = 2_000

    /// Budget allocated to the current curriculum stage context block.
    static let curriculumContextBudget = 500

    /// Budget allocated to the vocabulary section.
    static let vocabularyBudget = 700

    /// General safety buffer to absorb small measurement errors or late additions.
    static let bufferBudget = 500

    // MARK: - Token Estimation

    /// Estimates the number of tokens in `text` using a conservative 4-characters-per-token heuristic.
    /// Always returns at least 1 so callers never divide by zero or treat non-empty text as free.
    static func estimateTokenCount(_ text: String) -> Int {
        max(1, text.count / 4)
    }

    // MARK: - Vocabulary Formatting

    /// Formats a list of vocabulary entries into a plain-text block suitable for embedding in the system prompt.
    /// Each entry becomes a "Name: Description" line; entries are separated by newlines.
    static func formatVocabularyForPrompt(_ entries: [VocabularyEntry]) -> String {
        entries
            .map { "\($0.name): \($0.description)" }
            .joined(separator: "\n")
    }

    // MARK: - Progressive Vocabulary Trimming

    /// Returns a subset of `entries` that fits within `budget` estimated tokens, using progressive trimming.
    ///
    /// Trimming levels applied in order until the result fits:
    /// - Level 0: All entries fit → return all.
    /// - Level 1: Filter to entries whose name appears in the current stage's goals → check fit.
    /// - Level 2: Take at most the first 5 candidates from level 1 → check fit.
    /// - Level 3: Return empty (omit vocabulary entirely).
    static func trimVocabulary(
        entries: [VocabularyEntry],
        currentStage: CurriculumStage,
        budget: Int
    ) -> [VocabularyEntry] {

        // Helper: true when a candidate list's formatted text fits inside budget.
        func fitsInBudget(_ candidates: [VocabularyEntry]) -> Bool {
            estimateTokenCount(formatVocabularyForPrompt(candidates)) <= budget
        }

        // Level 0 – return everything if it already fits.
        if fitsInBudget(entries) {
            return entries
        }

        // Level 1 – filter to entries whose name is mentioned in any stage goal.
        let stageGoalText = currentStage.goals.joined(separator: " ").lowercased()
        let stageRelevantEntries = entries.filter { entry in
            stageGoalText.contains(entry.name.lowercased())
        }

        if fitsInBudget(stageRelevantEntries) {
            return stageRelevantEntries
        }

        // Level 2 – cap stage-relevant candidates at 5.
        let topFiveEntries = Array(stageRelevantEntries.prefix(5))

        if fitsInBudget(topFiveEntries) {
            return topFiveEntries
        }

        // Level 3 – nothing fits; omit vocabulary.
        return []
    }
}
