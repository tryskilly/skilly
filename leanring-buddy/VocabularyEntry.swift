// MARK: - SkillSight

import Foundation

/// A single entry in a skill's vocabulary glossary, parsed from a Markdown block
/// that begins with a `### Element Name` heading inside a SKILL.md file.
///
/// Vocabulary entries explain the name and purpose of a specific UI element or concept
/// that the skill teaches the user to work with.
struct VocabularyEntry: Codable, Sendable, Equatable {

    // MARK: Properties

    /// The name of the UI element or concept, taken from the H3 heading text.
    /// Example: "Mode Selector"
    let name: String

    /// Full prose description of the element. Lines within a paragraph are joined
    /// with a space; paragraphs are separated by `\n\n`. Leading and trailing
    /// whitespace is trimmed.
    let description: String

    // MARK: - Parsing

    /// Parses a `VocabularyEntry` from a Markdown block that begins with a `### Element Name`
    /// heading followed by one or more paragraphs of description text.
    ///
    /// Example block:
    /// ```markdown
    /// ### Mode Selector
    ///
    /// Dropdown in the toolbar that switches between photo editing modes.
    /// Choose the mode that matches your current task.
    ///
    /// Modes include Develop, Library, and Print.
    /// ```
    ///
    /// - Parameter markdownBlock: The raw Markdown text of a single vocabulary entry block.
    /// - Returns: A `VocabularyEntry` with the parsed name and description.
    /// - Throws: `SkillParsingError` if the block does not contain a valid `### Heading`.
    static func parse(from markdownBlock: String) throws -> VocabularyEntry {
        let lines = markdownBlock.components(separatedBy: "\n")

        guard let headingLine = lines.first(where: { $0.hasPrefix("### ") }) else {
            throw SkillParsingError.invalidYAMLStructure("VocabularyEntry block has no '### Element Name' heading.")
        }

        let parsedName = String(headingLine.dropFirst(4)).trimmingCharacters(in: .whitespaces)

        // All lines after the heading form the description.
        let headingLineIndex = lines.firstIndex(where: { $0.hasPrefix("### ") }) ?? 0
        let bodyLines = Array(lines[(headingLineIndex + 1)...])

        let parsedDescription = buildDescriptionFromBodyLines(bodyLines)

        return VocabularyEntry(name: parsedName, description: parsedDescription)
    }

    // MARK: - Private Parsing Helpers

    /// Groups body lines into paragraphs (blank lines as separators), joins lines within
    /// each paragraph with a single space, then joins paragraphs with `\n\n`.
    private static func buildDescriptionFromBodyLines(_ bodyLines: [String]) -> String {
        var paragraphs: [[String]] = []
        var currentParagraph: [String] = []

        for line in bodyLines {
            let trimmedLine = line.trimmingCharacters(in: .whitespaces)

            if trimmedLine.isEmpty {
                // A blank line ends the current paragraph.
                if !currentParagraph.isEmpty {
                    paragraphs.append(currentParagraph)
                    currentParagraph = []
                }
            } else {
                currentParagraph.append(trimmedLine)
            }
        }

        // Flush any paragraph that ends at the last line.
        if !currentParagraph.isEmpty {
            paragraphs.append(currentParagraph)
        }

        return paragraphs
            .map { $0.joined(separator: " ") }
            .joined(separator: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
