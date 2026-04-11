// MARK: - Skilly

import Foundation

// MARK: - SkillValidationResult

/// The result of running one or more safety/size validation checks against a skill or its content.
struct SkillValidationResult: Sendable {

    /// Whether all validation checks passed with no violations.
    let isValid: Bool

    /// Human-readable descriptions of each violation found. Empty when `isValid` is true.
    let violations: [String]

    /// A pre-built result representing a fully passing validation with no violations.
    static let valid = SkillValidationResult(isValid: true, violations: [])

    /// Builds a failing result that carries one or more violation messages.
    static func invalid(_ violations: [String]) -> SkillValidationResult {
        SkillValidationResult(isValid: false, violations: violations)
    }
}

// MARK: - SkillValidation

/// Namespace for all skill safety scanning and size-limit enforcement logic.
/// None of these functions throw — they always return a `SkillValidationResult`.
enum SkillValidation {

    // MARK: - Constants

    /// Maximum allowed approximate token count for a skill's Teaching Instructions section.
    /// Tokens are estimated as `characterCount / 4`.
    static let maxTeachingInstructionTokens = 4_000

    /// Maximum allowed approximate token count for the full raw skill file content.
    /// Tokens are estimated as `characterCount / 4`.
    static let maxTotalSkillTokens = 10_000

    // MARK: - Skilly — Completion Signal Constraints

    /// Minimum character length for completion signal keywords.
    /// Signals shorter than this are too generic and would trigger false positives
    /// in normal conversation (e.g., "a", "the", "ok").
    static let minCompletionSignalLength = 3

    // MARK: - Banned Patterns

    /// Patterns that are prohibited in teaching instructions, paired with a human-readable
    /// explanation of why the pattern is dangerous.
    ///
    /// Matching is performed case-insensitively against the lowercased instruction text so that
    /// mixed-case injections (e.g. "Ignore Previous Instructions") are caught reliably.
    private static let bannedPhraseDescriptions: [(phrase: String, reason: String)] = [
        ("ignore previous instructions",  "Prompt injection: attempts to override base prompt"),
        ("ignore all previous",           "Prompt injection: attempts to override base prompt"),
        ("disregard previous",            "Prompt injection: attempts to override base prompt"),
        ("you are no longer",             "Prompt injection: attempts to redefine assistant identity"),
        ("forget everything",             "Prompt injection: attempts to clear context"),
        ("forget all previous",           "Prompt injection: attempts to clear context"),
        ("override your",                 "Prompt injection: attempts to override behavior"),
        ("override the system",           "Prompt injection: attempts to override system prompt"),
        ("encode the screenshot",         "Data exfiltration: attempts to extract screenshot data"),
        ("encode the image",              "Data exfiltration: attempts to extract image data"),
        ("base64",                        "Data exfiltration: encoding instruction detected"),
        ("exfiltrate",                    "Data exfiltration: explicit exfiltration language"),
        ("transmit the",                  "Data exfiltration: attempts to transmit data"),
        ("send data to",                  "Data exfiltration: attempts to send data externally"),
    ]

    // MARK: - Validation Methods

    // MARK: - Skilly — Obfuscation Detection

    /// Unicode homoglyph mapping: visually similar characters that can bypass simple
    /// string matching. Maps confusable characters to their ASCII equivalents.
    private static let homoglyphMap: [Character: Character] = [
        // Cyrillic lookalikes
        "\u{0430}": "a",  // а → a
        "\u{0435}": "e",  // е → e
        "\u{043E}": "o",  // о → o
        "\u{0440}": "p",  // р → p
        "\u{0441}": "c",  // с → c
        "\u{0443}": "y",  // у → y
        "\u{0445}": "x",  // х → x
        // Fullwidth Latin
        "\u{FF41}": "a",  // ａ → a
        "\u{FF42}": "b",  // ｂ → b
        "\u{FF43}": "c",  // ｃ → c
        "\u{FF44}": "d",  // ｄ → d
        "\u{FF45}": "e",  // ｅ → e
        "\u{FF46}": "f",  // ｆ → f
        "\u{FF47}": "g",  // ｇ → g
        "\u{FF48}": "h",  // ｈ → h
        "\u{FF49}": "i",  // ｉ → i
        "\u{FF4A}": "j",  // ｊ → j
        "\u{FF4B}": "k",  // ｋ → k
        "\u{FF4C}": "l",  // ｌ → l
        "\u{FF4D}": "m",  // ｍ → m
        "\u{FF4E}": "n",  // ｎ → n
        "\u{FF4F}": "o",  // ｏ → o
        "\u{FF50}": "p",  // ｐ → p
        "\u{FF51}": "q",  // ｑ → q
        "\u{FF52}": "r",  // ｒ → r
        "\u{FF53}": "s",  // ｓ → s
        "\u{FF54}": "t",  // ｔ → t
        "\u{FF55}": "u",  // ｕ → u
        "\u{FF56}": "v",  // ｖ → v
        "\u{FF57}": "w",  // ｗ → w
        "\u{FF58}": "x",  // ｘ → x
        "\u{FF59}": "y",  // ｙ → y
        "\u{FF5A}": "z",  // ｚ → z
    ]

    /// Characters that should be stripped before pattern matching because they
    /// are invisible or serve no semantic purpose in banned phrase detection.
    private static let invisibleCharacters: [Character] = [
        "\u{200B}",  // Zero-width space
        "\u{200C}",  // Zero-width non-joiner
        "\u{200D}",  // Zero-width joiner
        "\u{FEFF}",  // Byte order mark / zero-width no-break space
        "\u{00AD}",  // Soft hyphen
        "\u{2060}",  // Word joiner
        "\u{180E}",  // Mongolian vowel separator
    ]

    /// Normalizes text by stripping invisible characters and replacing homoglyphs
    /// with their ASCII equivalents before banned-pattern scanning.
    static func normalizeForDetection(_ text: String) -> String {
        var stripped = text
        for char in invisibleCharacters {
            stripped = stripped.replacingOccurrences(of: String(char), with: "")
        }
        return String(stripped.map { homoglyphMap[$0] ?? $0 })
    }

    /// Scans teaching instructions for banned phrases and embedded URLs.
    ///
    /// - Matching is case-insensitive (text is lowercased before scanning).
    /// - URLs are detected via `https?://\S+` regardless of surrounding context.
    /// - Obfuscation is neutralized by stripping invisible characters and
    ///   replacing homoglyphs before pattern matching.
    ///
    /// - Parameter instructions: The raw teaching instructions string to validate.
    /// - Returns: `.valid` when no violations are found; `.invalid(_:)` listing every violation otherwise.
    static func validateTeachingInstructions(_ instructions: String) -> SkillValidationResult {
        var violations: [String] = []

        // MARK: - Skilly — Check both raw and normalized text to catch obfuscation
        let lowercasedInstructions = instructions.lowercased()
        let normalizedInstructions = normalizeForDetection(instructions).lowercased()

        // Check each banned phrase against both raw and normalized text.
        for bannedEntry in bannedPhraseDescriptions {
            if lowercasedInstructions.contains(bannedEntry.phrase) {
                violations.append(bannedEntry.reason)
            } else if normalizedInstructions.contains(bannedEntry.phrase) {
                violations.append("\(bannedEntry.reason) (obfuscated)")
            }
        }

        // Detect any embedded URLs — a skill author must not hardcode external endpoints.
        let urlDetectionPattern = #"https?://\S+"#
        if let urlRegex = try? NSRegularExpression(pattern: urlDetectionPattern),
           urlRegex.firstMatch(
               in: instructions,
               range: NSRange(instructions.startIndex..., in: instructions)
           ) != nil {
            violations.append("URL detected in teaching instructions: external URLs are not permitted")
        }

        return violations.isEmpty ? .valid : .invalid(violations)
    }

    /// Checks that the teaching instructions do not exceed the token budget.
    ///
    /// Token count is approximated as `characterCount / 4`, which is a standard rough estimate
    /// for English prose with average word length.
    ///
    /// - Parameter instructions: The raw teaching instructions string.
    /// - Returns: `.valid` when within the limit; `.invalid(_:)` with a size violation otherwise.
    static func validateTeachingInstructionsSize(_ instructions: String) -> SkillValidationResult {
        let approximateTokenCount = instructions.count / 4
        if approximateTokenCount > maxTeachingInstructionTokens {
            return .invalid([
                "Teaching instructions exceed the \(maxTeachingInstructionTokens)-token limit " +
                "(approximately \(approximateTokenCount) tokens estimated)"
            ])
        }
        return .valid
    }

    /// Checks that the full raw skill file content does not exceed the total token budget.
    ///
    /// Token count is approximated as `characterCount / 4`.
    ///
    /// - Parameter rawContent: The complete raw text of the SKILL.md file.
    /// - Returns: `.valid` when within the limit; `.invalid(_:)` with a size violation otherwise.
    static func validateTotalSkillSize(_ rawContent: String) -> SkillValidationResult {
        let approximateTokenCount = rawContent.count / 4
        if approximateTokenCount > maxTotalSkillTokens {
            return .invalid([
                "Total skill content exceeds the \(maxTotalSkillTokens)-token limit " +
                "(approximately \(approximateTokenCount) tokens estimated)"
            ])
        }
        return .valid
    }

    // MARK: - Skilly

    static func validateAllSkillContent(_ skill: SkillDefinition) -> SkillValidationResult {
        var violations: [String] = []

        let skillNameCheckResult = validateTeachingInstructions(skill.metadata.name)
        violations.append(contentsOf: skillNameCheckResult.violations.map { "Skill name: \($0)" })

        let skillDescriptionCheckResult = validateTeachingInstructions(skill.skillDescription)
        violations.append(contentsOf: skillDescriptionCheckResult.violations.map { "Skill description: \($0)" })

        for curriculumStage in skill.curriculumStages {
            let escapedStageName = curriculumStage.name.replacingOccurrences(of: "\n", with: " ")

            for stageGoal in curriculumStage.goals {
                let goalCheckResult = validateTeachingInstructions(stageGoal)
                violations.append(contentsOf: goalCheckResult.violations.map {
                    "Curriculum stage '\(escapedStageName)' goal: \($0)"
                })
            }

            for completionSignal in curriculumStage.completionSignals {
                let signalCheckResult = validateTeachingInstructions(completionSignal)
                violations.append(contentsOf: signalCheckResult.violations.map {
                    "Curriculum stage '\(escapedStageName)' completion signal: \($0)"
                })

                // MARK: - Skilly — Reject overly generic completion signals
                if completionSignal.count < minCompletionSignalLength {
                    violations.append(
                        "Curriculum stage '\(escapedStageName)' completion signal '\(completionSignal)' is too short " +
                        "(minimum \(minCompletionSignalLength) characters). Generic signals trigger false positives in normal conversation."
                    )
                }
            }
        }

        for vocabularyEntry in skill.vocabularyEntries {
            let escapedVocabularyName = vocabularyEntry.name.replacingOccurrences(of: "\n", with: " ")

            let vocabularyNameCheckResult = validateTeachingInstructions(vocabularyEntry.name)
            violations.append(contentsOf: vocabularyNameCheckResult.violations.map {
                "Vocabulary entry '\(escapedVocabularyName)' name: \($0)"
            })

            let lowercasedVocabularyName = vocabularyEntry.name.lowercased()
            if lowercasedVocabularyName.contains("[point:") {
                violations.append(
                    "Vocabulary entry '\(escapedVocabularyName)' name: contains [POINT: tag pattern, which is not allowed"
                )
            }

            let vocabularyDescriptionCheckResult = validateTeachingInstructions(vocabularyEntry.description)
            violations.append(contentsOf: vocabularyDescriptionCheckResult.violations.map {
                "Vocabulary entry '\(escapedVocabularyName)' description: \($0)"
            })
        }

        return violations.isEmpty ? .valid : .invalid(violations)
    }

    /// Runs all validation checks (banned patterns, URL detection, teaching size, total size)
    /// against a parsed skill and its raw source content, then combines every violation found
    /// into a single result.
    ///
    /// - Parameters:
    ///   - skill: The fully parsed `SkillDefinition` to validate.
    ///   - rawContent: The original raw SKILL.md text that produced `skill`.
    /// - Returns: `.valid` when all checks pass; `.invalid(_:)` listing every violation otherwise.
    static func validate(skill: SkillDefinition, rawContent: String) -> SkillValidationResult {
        let contentCheckResult = validateTeachingInstructions(skill.teachingInstructions)
        let teachingSizeCheckResult = validateTeachingInstructionsSize(skill.teachingInstructions)
        let totalSizeCheckResult = validateTotalSkillSize(rawContent)
        let allContentCheckResult = validateAllSkillContent(skill)

        let allViolations = contentCheckResult.violations
            + teachingSizeCheckResult.violations
            + totalSizeCheckResult.violations
            + allContentCheckResult.violations

        return allViolations.isEmpty ? .valid : .invalid(allViolations)
    }
}
