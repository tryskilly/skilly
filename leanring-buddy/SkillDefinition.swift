// MARK: - Skilly

import Foundation

/// A fully parsed SKILL.md file, combining the YAML frontmatter metadata with all
/// structured content sections (description, teaching instructions, curriculum, vocabulary).
struct SkillDefinition: Sendable {

    /// Parsed metadata from the YAML frontmatter block.
    let metadata: SkillMetadata

    /// The skill's marketplace description — content between the frontmatter and the first H2,
    /// with any H1 title line stripped.
    let skillDescription: String

    /// The full verbatim content of the "## Teaching Instructions" section,
    /// including all nested H3 headings and their content.
    let teachingInstructions: String

    /// Ordered list of curriculum stages, parsed from H3 blocks within "## Curriculum".
    let curriculumStages: [CurriculumStage]

    /// UI vocabulary entries, parsed from H3 blocks within "## UI Vocabulary".
    let vocabularyEntries: [VocabularyEntry]

    /// The file-system path of the directory containing the SKILL.md file, or nil
    /// when the definition was created programmatically (e.g. in tests).
    let sourceDirectoryPath: String?

    // MARK: - Parsing

    /// Parses a complete `SkillDefinition` from a SKILL.md file's raw Markdown content.
    ///
    /// - Parameters:
    ///   - markdownContent: The full raw text of a SKILL.md file.
    ///   - sourceDirectoryPath: The directory containing the file; pass nil for programmatic use.
    /// - Returns: A fully validated `SkillDefinition`.
    /// - Throws: `SkillParsingError` if the content is malformed or any required section is missing.
    static func parse(
        from markdownContent: String,
        sourceDirectoryPath: String? = nil
    ) throws -> SkillDefinition {

        // Step 1: Split the raw file into a YAML frontmatter block and the Markdown body.
        let (yamlContent, markdownBody) = try extractFrontmatter(from: markdownContent)

        // Step 2: Parse the YAML into a SkillMetadata value.
        // Pass raw YAML without delimiters — SkillMetadata.parse accepts either form.
        let parsedMetadata = try SkillMetadata.parse(from: yamlContent)

        // Step 3: Split the Markdown body by top-level H2 headings into named sections.
        let sectionsByHeading = splitByH2Headings(markdownBody)

        // Step 4: Extract the skill description from the preamble (content before first H2).
        let rawPreamble = sectionsByHeading["_preamble"] ?? ""
        let trimmedSkillDescription = rawPreamble.trimmingCharacters(in: .whitespacesAndNewlines)

        // Step 5: Extract the Teaching Instructions section (required).
        guard let teachingInstructionsContent = sectionsByHeading["Teaching Instructions"] else {
            throw SkillParsingError.sectionNotFound("Teaching Instructions")
        }
        let trimmedTeachingInstructions = teachingInstructionsContent
            .trimmingCharacters(in: .whitespacesAndNewlines)

        // Step 6: Parse curriculum stages from the "Curriculum" section (optional — defaults to empty).
        var parsedCurriculumStages: [CurriculumStage] = []
        if let curriculumSectionContent = sectionsByHeading["Curriculum"] {
            let stageBlocks = splitByH3Headings(curriculumSectionContent)
            for (stageIndex, stageBlock) in stageBlocks.enumerated() {
                let parsedStage = try CurriculumStage.parse(from: stageBlock, stageIndex: stageIndex)
                parsedCurriculumStages.append(parsedStage)
            }
        }

        // Step 7: Parse UI vocabulary entries from the "UI Vocabulary" section (optional — defaults to empty).
        var parsedVocabularyEntries: [VocabularyEntry] = []
        if let vocabularySectionContent = sectionsByHeading["UI Vocabulary"] {
            let entryBlocks = splitByH3Headings(vocabularySectionContent)
            for entryBlock in entryBlocks {
                let parsedEntry = try VocabularyEntry.parse(from: entryBlock)
                parsedVocabularyEntries.append(parsedEntry)
            }
        }

        return SkillDefinition(
            metadata: parsedMetadata,
            skillDescription: trimmedSkillDescription,
            teachingInstructions: trimmedTeachingInstructions,
            curriculumStages: parsedCurriculumStages,
            vocabularyEntries: parsedVocabularyEntries,
            sourceDirectoryPath: sourceDirectoryPath
        )
    }

    // MARK: - Private Parsing Helpers

    /// Splits a raw SKILL.md string into its YAML frontmatter content and Markdown body.
    ///
    /// The frontmatter must be delimited by a leading `---` line and a closing `---` line.
    /// The returned `yaml` string contains only the content between the delimiters (no `---` markers).
    /// The returned `body` string contains everything after the closing delimiter.
    ///
    /// - Throws: `SkillParsingError.missingFrontmatter` if no valid `---` delimiters are found.
    private static func extractFrontmatter(from rawContent: String) throws -> (yaml: String, body: String) {
        let lines = rawContent.components(separatedBy: "\n")

        // Find the opening delimiter — the first line that is exactly "---".
        guard let openingDelimiterIndex = lines.firstIndex(where: {
            $0.trimmingCharacters(in: .whitespaces) == "---"
        }) else {
            throw SkillParsingError.missingFrontmatter
        }

        // Find the closing delimiter — the next "---" line after the opening one.
        let linesAfterOpening = lines[(openingDelimiterIndex + 1)...]
        guard let closingDelimiterIndex = linesAfterOpening.firstIndex(where: {
            $0.trimmingCharacters(in: .whitespaces) == "---"
        }) else {
            throw SkillParsingError.missingFrontmatter
        }

        // The YAML content sits between the two delimiters.
        let yamlLines = lines[(openingDelimiterIndex + 1)..<closingDelimiterIndex]
        let yamlContent = yamlLines.joined(separator: "\n")

        // Everything after the closing delimiter is the Markdown body.
        let bodyStartIndex = lines.index(after: closingDelimiterIndex)
        let bodyLines = lines[bodyStartIndex...]
        let bodyContent = bodyLines.joined(separator: "\n")

        return (yaml: yamlContent, body: bodyContent)
    }

    /// Splits a Markdown string by top-level H2 headings (`## Heading`, but NOT `### Sub-heading`).
    ///
    /// Content before the first H2 heading is stored under the key `"_preamble"`. Any H1 title
    /// lines (lines starting with `# ` but not `## `) in the preamble are stripped so that the
    /// returned preamble contains only the descriptive prose.
    ///
    /// Each value in the returned dictionary contains the content that follows the heading,
    /// not the heading line itself.
    private static func splitByH2Headings(_ content: String) -> [String: String] {
        var sectionsByHeading: [String: String] = [:]
        var currentSectionKey: String = "_preamble"
        var currentSectionLines: [String] = []

        let lines = content.components(separatedBy: "\n")

        for line in lines {
            // Detect an H2 heading: starts with "## " but NOT "### ".
            if line.hasPrefix("## ") && !line.hasPrefix("### ") {
                // Save the accumulated lines for the previous section.
                sectionsByHeading[currentSectionKey] = currentSectionLines.joined(separator: "\n")

                // Extract the heading text and begin a new section.
                let headingText = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                currentSectionKey = headingText
                currentSectionLines = []
            } else {
                // When accumulating the preamble, strip any H1 title lines.
                if currentSectionKey == "_preamble" && line.hasPrefix("# ") && !line.hasPrefix("## ") {
                    // Skip the H1 title — it is not part of the description.
                    continue
                }
                currentSectionLines.append(line)
            }
        }

        // Save the final section.
        sectionsByHeading[currentSectionKey] = currentSectionLines.joined(separator: "\n")

        return sectionsByHeading
    }

    /// Splits a section's content by H3 headings (`### Heading`).
    ///
    /// Returns an array of blocks where each block begins with its `### Heading` line and
    /// includes all content up to (but not including) the next `### ` line.
    /// Blocks are returned in document order.
    private static func splitByH3Headings(_ content: String) -> [String] {
        var resultBlocks: [String] = []
        var currentBlockLines: [String] = []
        var isInsideBlock = false

        let lines = content.components(separatedBy: "\n")

        for line in lines {
            if line.hasPrefix("### ") {
                // If we were already inside a block, save it before starting the new one.
                if isInsideBlock {
                    resultBlocks.append(currentBlockLines.joined(separator: "\n"))
                    currentBlockLines = []
                }
                isInsideBlock = true
                currentBlockLines.append(line)
            } else if isInsideBlock {
                currentBlockLines.append(line)
            }
            // Lines before the first H3 are ignored (they belong to the H2 section intro).
        }

        // Save the last block if there is one.
        if isInsideBlock && !currentBlockLines.isEmpty {
            resultBlocks.append(currentBlockLines.joined(separator: "\n"))
        }

        return resultBlocks
    }
}
