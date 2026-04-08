// MARK: - SkillSight

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

    /// Scans teaching instructions for banned phrases and embedded URLs.
    ///
    /// - Matching is case-insensitive (text is lowercased before scanning).
    /// - URLs are detected via `https?://\S+` regardless of surrounding context.
    ///
    /// - Parameter instructions: The raw teaching instructions string to validate.
    /// - Returns: `.valid` when no violations are found; `.invalid(_:)` listing every violation otherwise.
    static func validateTeachingInstructions(_ instructions: String) -> SkillValidationResult {
        var violations: [String] = []

        let lowercasedInstructions = instructions.lowercased()

        // Check each banned phrase against the lowercased text.
        for bannedEntry in bannedPhraseDescriptions {
            if lowercasedInstructions.contains(bannedEntry.phrase) {
                violations.append(bannedEntry.reason)
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

        let allViolations = contentCheckResult.violations
            + teachingSizeCheckResult.violations
            + totalSizeCheckResult.violations

        return allViolations.isEmpty ? .valid : .invalid(allViolations)
    }
}
