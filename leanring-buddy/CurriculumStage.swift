// MARK: - SkillSight

import Foundation

/// A single stage in a skill's learning curriculum, parsed from a Markdown block
/// that begins with a `### Stage N: Name` heading inside a SKILL.md file.
struct CurriculumStage: Codable, Sendable, Equatable {

    // MARK: Identity

    /// Stable, URL-friendly identifier derived from `name` (lowercased, spaces replaced with hyphens,
    /// only letters/digits/hyphens retained). Example: "Getting Around" → "getting-around".
    let id: String

    /// Human-readable stage name taken from the heading text after the colon.
    /// Example: "Getting Around"
    let name: String

    /// 1-based position of this stage in the curriculum, parsed from "Stage N" in the heading.
    let stageNumber: Int

    /// Prose description of what this stage covers, taken from lines that appear before
    /// the first bold field (`**Field:**`).
    let description: String

    /// What the learner should be able to do by the end of this stage.
    /// Parsed from the list items under `**Goals:**`.
    let goals: [String]

    /// Short keyword phrases that signal the learner has mastered this stage.
    /// Parsed from the comma-separated value of `**Completion signals:**`.
    let completionSignals: [String]

    /// Name of the stage (or stages) that must be completed before this one.
    /// `nil` when the field is absent from the Markdown block.
    let prerequisites: String?

    /// Name of the stage that follows this one in the curriculum sequence.
    /// `nil` when the `**Next:**` field value is "null" or the field is absent.
    let nextStageName: String?

    // MARK: - Static Helpers

    /// Generates a stable, URL-friendly ID from a human-readable stage name.
    ///
    /// Lowercases the name, replaces spaces with hyphens, then strips any character
    /// that is not a letter, digit, or hyphen.
    ///
    /// Example: "Non-Destructive Modifiers" → "non-destructive-modifiers"
    static func idFromName(_ name: String) -> String {
        let lowercasedWithHyphens = name.lowercased().replacingOccurrences(of: " ", with: "-")
        let allowedCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-"))
        return lowercasedWithHyphens
            .unicodeScalars
            .filter { allowedCharacters.contains($0) }
            .map { String($0) }
            .joined()
    }

    // MARK: - Parsing

    /// Parses a `CurriculumStage` from a Markdown block that begins with a
    /// `### Stage N: Name` heading.
    ///
    /// Expected block structure:
    /// ```markdown
    /// ### Stage 1: Getting Around
    ///
    /// Description prose here.
    ///
    /// **Goals:**
    /// - Goal one
    /// - Goal two
    ///
    /// **Completion signals:** keyword one, keyword two
    /// **Prerequisites:** Stage 0: Basics
    /// **Next:** Advanced Techniques
    /// ```
    ///
    /// - Parameters:
    ///   - markdownBlock: The raw Markdown text of a single curriculum stage block.
    ///   - stageIndex: Zero-based index used as a fallback if stage number cannot be parsed.
    /// - Returns: A fully populated `CurriculumStage`.
    /// - Throws: `SkillParsingError` if the block is malformed or missing required fields.
    static func parse(from markdownBlock: String, stageIndex: Int) throws -> CurriculumStage {
        let lines = markdownBlock.components(separatedBy: "\n")

        guard let headingLine = lines.first(where: { $0.hasPrefix("### ") }) else {
            throw SkillParsingError.invalidYAMLStructure("CurriculumStage block has no '### Stage N: Name' heading.")
        }

        // Parse stage number and name from the heading.
        // Expected heading format: "### Stage N: Name"
        let headingText = String(headingLine.dropFirst(4)).trimmingCharacters(in: .whitespaces)
        let parsedStageNumber: Int
        let parsedName: String

        if headingText.hasPrefix("Stage "), let colonRange = headingText.range(of: ": ") {
            let stageTokens = headingText[headingText.startIndex..<colonRange.lowerBound]
            let stageNumberString = stageTokens.replacingOccurrences(of: "Stage ", with: "")
            parsedStageNumber = Int(stageNumberString) ?? (stageIndex + 1)
            parsedName = String(headingText[colonRange.upperBound...]).trimmingCharacters(in: .whitespaces)
        } else {
            parsedStageNumber = stageIndex + 1
            parsedName = headingText
        }

        let parsedId = idFromName(parsedName)

        // Separate the heading line from the body lines.
        let headingLineIndex = lines.firstIndex(where: { $0.hasPrefix("### ") }) ?? 0
        let bodyLines = Array(lines[(headingLineIndex + 1)...])

        // Extract description: prose lines before the first `**Field:**` bold marker.
        let parsedDescription = extractDescriptionFromBodyLines(bodyLines)

        // Extract goals: list items under **Goals:**.
        let parsedGoals = extractListItems(forBoldField: "Goals", from: bodyLines)

        // Extract completion signals: comma-separated value of **Completion signals:**.
        let completionSignalsRaw = extractInlineFieldValue(forBoldField: "Completion signals", from: bodyLines)
        let parsedCompletionSignals: [String]
        if let rawSignals = completionSignalsRaw, !rawSignals.isEmpty {
            parsedCompletionSignals = rawSignals
                .components(separatedBy: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        } else {
            parsedCompletionSignals = []
        }

        // Extract prerequisites: inline value of **Prerequisites:** (nil if absent).
        let parsedPrerequisites = extractInlineFieldValue(forBoldField: "Prerequisites", from: bodyLines)

        // Extract next stage name: inline value of **Next:** (nil if "null" or absent).
        let nextRaw = extractInlineFieldValue(forBoldField: "Next", from: bodyLines)
        let parsedNextStageName: String?
        if let nextValue = nextRaw, !nextValue.isEmpty, nextValue.lowercased() != "null" {
            parsedNextStageName = nextValue
        } else {
            parsedNextStageName = nil
        }

        return CurriculumStage(
            id: parsedId,
            name: parsedName,
            stageNumber: parsedStageNumber,
            description: parsedDescription,
            goals: parsedGoals,
            completionSignals: parsedCompletionSignals,
            prerequisites: parsedPrerequisites,
            nextStageName: parsedNextStageName
        )
    }

    // MARK: - Private Parsing Helpers

    /// Collects all non-blank prose lines that appear before the first `**Field:**` bold marker line.
    /// Lines are joined into a single string, with paragraph breaks represented by `\n\n`.
    private static func extractDescriptionFromBodyLines(_ bodyLines: [String]) -> String {
        var descriptionParagraphs: [[String]] = []
        var currentParagraph: [String] = []

        for line in bodyLines {
            // Stop when we hit the first bold field marker.
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("**") {
                break
            }

            let trimmedLine = line.trimmingCharacters(in: .whitespaces)

            if trimmedLine.isEmpty {
                // A blank line ends the current paragraph.
                if !currentParagraph.isEmpty {
                    descriptionParagraphs.append(currentParagraph)
                    currentParagraph = []
                }
            } else {
                currentParagraph.append(trimmedLine)
            }
        }

        if !currentParagraph.isEmpty {
            descriptionParagraphs.append(currentParagraph)
        }

        return descriptionParagraphs
            .map { $0.joined(separator: " ") }
            .joined(separator: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Finds the `**FieldName:**` line and collects subsequent `- item` list lines as an array.
    private static func extractListItems(forBoldField fieldName: String, from bodyLines: [String]) -> [String] {
        let fieldMarker = "**\(fieldName):**"
        var collectingItems = false
        var items: [String] = []

        for line in bodyLines {
            let trimmedLine = line.trimmingCharacters(in: .whitespaces)

            if trimmedLine == fieldMarker || trimmedLine.hasPrefix(fieldMarker) {
                collectingItems = true
                continue
            }

            if collectingItems {
                if trimmedLine.hasPrefix("- ") {
                    let itemText = String(trimmedLine.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                    items.append(itemText)
                } else if trimmedLine.isEmpty {
                    // Allow blank lines between items.
                    continue
                } else if trimmedLine.hasPrefix("**") {
                    // A new bold field means the list is over.
                    break
                } else {
                    // Non-list, non-empty, non-bold line also ends collection.
                    break
                }
            }
        }

        return items
    }

    /// Finds a line matching `**FieldName:** value` and returns the inline value portion.
    /// Returns `nil` if no matching line is found.
    private static func extractInlineFieldValue(forBoldField fieldName: String, from bodyLines: [String]) -> String? {
        let fieldMarker = "**\(fieldName):**"

        for line in bodyLines {
            let trimmedLine = line.trimmingCharacters(in: .whitespaces)
            if trimmedLine.hasPrefix(fieldMarker) {
                let valuePortionStartIndex = trimmedLine.index(trimmedLine.startIndex, offsetBy: fieldMarker.count)
                let rawValue = String(trimmedLine[valuePortionStartIndex...]).trimmingCharacters(in: .whitespaces)
                return rawValue.isEmpty ? nil : rawValue
            }
        }

        return nil
    }
}
