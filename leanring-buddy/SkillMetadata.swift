// MARK: - Skilly

import Foundation

/// The pointing behavior a skill requests from the cursor overlay.
enum PointingMode: String, Codable, Sendable {
    case always = "always"
    case whenRelevant = "when-relevant"
    case minimal = "minimal"
}

/// Errors that can occur while parsing a SKILL.md YAML frontmatter block.
enum SkillParsingError: Error, CustomStringConvertible {
    case missingFrontmatter
    case missingRequiredField(String)
    case unsupportedFormatVersion(String)
    case invalidSkillId(String)
    case invalidPointingMode(String)
    case invalidYAMLStructure(String)
    case sectionNotFound(String)

    var description: String {
        switch self {
        case .missingFrontmatter:
            return "The SKILL.md file does not contain a YAML frontmatter block delimited by '---'."
        case .missingRequiredField(let fieldName):
            return "Required field '\(fieldName)' is missing from the YAML frontmatter."
        case .unsupportedFormatVersion(let version):
            return "Unsupported format_version '\(version)'. Supported versions: 1.0."
        case .invalidSkillId(let id):
            return "Skill ID '\(id)' is invalid. IDs must match '^[a-z0-9]+(-[a-z0-9]+)*$' (e.g. 'my-skill')."
        case .invalidPointingMode(let mode):
            return "Invalid pointing_mode '\(mode)'. Valid values: always, when-relevant, minimal."
        case .invalidYAMLStructure(let detail):
            return "Invalid YAML structure: \(detail)"
        case .sectionNotFound(let sectionName):
            return "Expected section '\(sectionName)' was not found in the SKILL.md file."
        }
    }
}

/// Metadata parsed from the YAML frontmatter of a SKILL.md file.
///
/// The frontmatter must be a flat key-value block (no nested objects) enclosed
/// between leading and trailing `---` markers. Array values are expressed with
/// the standard YAML block-sequence style:
/// ```yaml
/// tags:
///   - swift
///   - macos
/// ```
struct SkillMetadata: Codable, Sendable {

    // MARK: Identity

    /// Machine-readable identifier for this skill, e.g. "xcode-debugger".
    /// Must match `^[a-z0-9]+(-[a-z0-9]+)*$`.
    let id: String

    /// Human-readable name shown to the user, e.g. "Xcode Debugger".
    let name: String

    /// Optional short summary pulled from frontmatter (for example `description:` in
    /// standard cross-agent SKILL.md files).
    let shortDescription: String?

    /// Semantic version of this skill definition, e.g. "1.0.0".
    let version: String

    /// Version of the SKILL.md format specification this file conforms to.
    /// Currently only "1.0" is supported.
    let formatVersion: String

    /// Minimum version of the Skilly runtime required to load this skill.
    let minRuntimeVersion: String

    // MARK: Attribution

    /// Author or organization that created this skill.
    let author: String

    /// SPDX license identifier, e.g. "MIT".
    let license: String

    // MARK: Target Application

    /// Display name of the application this skill teaches, e.g. "Xcode".
    let targetApp: String

    /// macOS bundle identifier of the target application, e.g. "com.apple.dt.Xcode".
    let bundleId: String

    /// Minimum version of the target application required for this skill (optional).
    let minAppVersion: String?

    /// Platform this skill targets, e.g. "macOS".
    let platform: String

    // MARK: AI Behavior

    /// Claude model recommended for this skill, e.g. "claude-sonnet-4-6" (optional).
    let recommendedModel: String?

    /// How aggressively the cursor overlay should point at UI elements during this skill.
    let pointingMode: PointingMode

    // MARK: Classification

    /// Broad category for this skill, e.g. "debugging".
    let category: String

    /// Searchable tags that describe this skill, e.g. ["swift", "xcode", "debugging"].
    let tags: [String]

    /// Difficulty level descriptor, e.g. "beginner", "intermediate", "advanced" (optional).
    let difficulty: String?

    /// Rough estimate of how many hours it takes to complete this skill (optional).
    let estimatedHours: Int?

    // MARK: - Parsing

    /// Supported format_version values.
    private static let supportedFormatVersions: Set<String> = ["1.0"]

    /// Regex pattern that a valid skill ID must fully match.
    private static let validSkillIdPattern = "^[a-z0-9]+(-[a-z0-9]+)*$"

    /// Parses a `SkillMetadata` instance from a YAML frontmatter string.
    ///
    /// The parser is intentionally simple: it handles flat `key: value` lines and
    /// single-level block sequences (`  - item`). Nested YAML objects are not supported.
    ///
    /// Accepts either raw YAML content (no delimiters) or content wrapped in `---`
    /// delimiters. When delimiters are present, only the content between them is parsed.
    ///
    /// - Parameter yamlString: The YAML frontmatter content, with or without `---` delimiters.
    /// - Returns: A fully validated `SkillMetadata` value.
    /// - Throws: `SkillParsingError` if the content is malformed or fails validation.
    static func parse(from yamlString: String) throws -> SkillMetadata {
        let frontmatterContent = stripFrontmatterDelimitersIfPresent(yamlString)
        let keyValueMap = try buildKeyValueMap(from: frontmatterContent)
        return try buildAndValidateMetadata(from: keyValueMap)
    }

    // MARK: - Private Parsing Helpers

    /// Strips `---` delimiters if present, returning only the YAML content between them.
    /// If no delimiters are found, returns the input as-is (assumes raw YAML content).
    private static func stripFrontmatterDelimitersIfPresent(_ yamlString: String) -> String {
        let lines = yamlString.components(separatedBy: "\n")

        guard let openingDelimiterIndex = lines.firstIndex(where: { $0.trimmingCharacters(in: .whitespaces) == "---" }) else {
            // No delimiters found — treat entire string as raw YAML content
            return yamlString
        }

        let linesAfterOpening = lines[(openingDelimiterIndex + 1)...]
        guard let closingDelimiterIndex = linesAfterOpening.firstIndex(where: { $0.trimmingCharacters(in: .whitespaces) == "---" }) else {
            // Only one delimiter found — treat content after it as YAML
            return linesAfterOpening.joined(separator: "\n")
        }

        let frontmatterLines = lines[(openingDelimiterIndex + 1)..<closingDelimiterIndex]
        return frontmatterLines.joined(separator: "\n")
    }

    /// Converts raw frontmatter text into a dictionary of string keys to string (or array) values.
    ///
    /// Array values are accumulated from lines starting with `  - ` that follow a key line
    /// whose value part is empty. They are joined as a comma-separated string so the entire
    /// map can remain `[String: String]` for simplicity.
    private static func buildKeyValueMap(from frontmatterContent: String) throws -> [String: String] {
        var keyValueMap: [String: String] = [:]
        var currentArrayKey: String? = nil
        var currentArrayItems: [String] = []

        let lines = frontmatterContent.components(separatedBy: "\n")

        func flushCurrentArray() {
            if let arrayKey = currentArrayKey {
                keyValueMap[arrayKey] = currentArrayItems.joined(separator: ",")
                currentArrayKey = nil
                currentArrayItems = []
            }
        }

        for line in lines {
            // Skip blank lines.
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                continue
            }

            // Detect a block-sequence item with flexible indentation, e.g.:
            // `  - item` or `- item`.
            let trimmedLine = line.trimmingCharacters(in: .whitespaces)
            if trimmedLine.hasPrefix("- ") {
                guard currentArrayKey != nil else {
                    throw SkillParsingError.invalidYAMLStructure("Array item found without a parent key: '\(line)'")
                }
                let rawItemValue = String(trimmedLine.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                let itemValue = normalizeScalarValue(rawItemValue)
                currentArrayItems.append(itemValue)
                continue
            }

            // A non-indented line that contains a colon ends any open array.
            flushCurrentArray()

            // Parse `key: value` pairs.
            guard let colonIndex = line.firstIndex(of: ":") else {
                // Lines with no colon are unexpected at the top level.
                throw SkillParsingError.invalidYAMLStructure("Unexpected line without a colon: '\(line)'")
            }

            let rawKey = String(line[line.startIndex..<colonIndex]).trimmingCharacters(in: .whitespaces)
            let rawValue = String(line[line.index(after: colonIndex)...]).trimmingCharacters(in: .whitespaces)

            if rawValue.isEmpty {
                // This key introduces a block sequence on the following lines.
                currentArrayKey = rawKey
            } else {
                keyValueMap[rawKey] = normalizeScalarValue(rawValue)
            }
        }

        // Flush any array that ends at the last line of the frontmatter.
        flushCurrentArray()

        return keyValueMap
    }

    /// Normalizes scalar YAML values used in frontmatter parsing.
    /// Supports common SKILL.md authoring style where values are quoted, e.g.
    /// `format_version: "1.0"` or `name: 'Blender Fundamentals'`.
    private static func normalizeScalarValue(_ rawValue: String) -> String {
        let trimmedValue = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedValue.count >= 2 else { return trimmedValue }

        let firstCharacter = trimmedValue.first
        let lastCharacter = trimmedValue.last

        let isWrappedInDoubleQuotes = firstCharacter == "\"" && lastCharacter == "\""
        let isWrappedInSingleQuotes = firstCharacter == "'" && lastCharacter == "'"

        if isWrappedInDoubleQuotes || isWrappedInSingleQuotes {
            return String(trimmedValue.dropFirst().dropLast()).trimmingCharacters(in: .whitespacesAndNewlines)
        }

        return trimmedValue
    }

    /// Reads parsed frontmatter fields, applies compatibility defaults for common external
    /// SKILL.md formats, and constructs a `SkillMetadata`.
    private static func buildAndValidateMetadata(from keyValueMap: [String: String]) throws -> SkillMetadata {

        // MARK: Field extraction helpers
        func firstNonEmptyValue(for keys: [String]) -> String? {
            for key in keys {
                if let value = keyValueMap[key], !value.isEmpty {
                    return value
                }
            }
            return nil
        }

        func normalizedSkillId(from rawValue: String) -> String {
            let lowered = rawValue.lowercased()
            let replacedNonAlphanumeric = lowered.replacingOccurrences(
                of: "[^a-z0-9]+",
                with: "-",
                options: .regularExpression
            )
            let collapsedHyphens = replacedNonAlphanumeric.replacingOccurrences(
                of: "-+",
                with: "-",
                options: .regularExpression
            )
            return collapsedHyphens.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        }

        func inferTargetAppAndBundleId(fromName parsedName: String, parsedId: String) -> (targetApp: String, bundleId: String)? {
            let lowercasedName = parsedName.lowercased()
            let lowercasedId = parsedId.lowercased()

            let knownAppMappings: [(prefix: String, targetApp: String, bundleId: String)] = [
                ("figma", "Figma", "com.figma.Desktop"),
                ("blender", "Blender", "org.blenderfoundation.blender"),
                ("xcode", "Xcode", "com.apple.dt.Xcode"),
                ("vscode", "Visual Studio Code", "com.microsoft.VSCode")
            ]

            for knownAppMapping in knownAppMappings {
                if lowercasedId.hasPrefix("\(knownAppMapping.prefix)-")
                    || lowercasedId == knownAppMapping.prefix
                    || lowercasedName.hasPrefix("\(knownAppMapping.prefix)-")
                    || lowercasedName == knownAppMapping.prefix {
                    return (knownAppMapping.targetApp, knownAppMapping.bundleId)
                }
            }

            return nil
        }

        // MARK: Required fields (compatibility-aware)
        guard let parsedName = firstNonEmptyValue(for: ["name", "title"]), !parsedName.isEmpty else {
            throw SkillParsingError.missingRequiredField("name")
        }

        let rawIdFromFrontmatter = firstNonEmptyValue(for: ["id", "slug"])
        let parsedId = normalizedSkillId(from: rawIdFromFrontmatter ?? parsedName)
        guard !parsedId.isEmpty else {
            throw SkillParsingError.invalidSkillId(rawIdFromFrontmatter ?? parsedName)
        }

        let parsedVersion = firstNonEmptyValue(for: ["version"]) ?? "1.0.0"
        let parsedMinRuntimeVersion = firstNonEmptyValue(for: ["min_runtime_version"]) ?? "1.0.0"
        let parsedAuthor = firstNonEmptyValue(for: ["author", "maintainer", "creator"]) ?? "Unknown"
        let parsedLicense = firstNonEmptyValue(for: ["license"]) ?? "UNSPECIFIED"
        let inferredAppMapping = inferTargetAppAndBundleId(fromName: parsedName, parsedId: parsedId)
        let parsedTargetApp = firstNonEmptyValue(for: ["target_app", "target", "app"])
            ?? inferredAppMapping?.targetApp
            ?? "General"
        let parsedPlatform = firstNonEmptyValue(for: ["platform"]) ?? "macOS"
        let parsedCategory = firstNonEmptyValue(for: ["category"]) ?? "general"
        let parsedShortDescription = firstNonEmptyValue(for: ["description", "summary"])

        // MARK: format_version (compatibility-aware)
        let rawFormatVersion = firstNonEmptyValue(for: ["format_version"])
        let parsedFormatVersion: String
        if let rawFormatVersion, supportedFormatVersions.contains(rawFormatVersion) {
            parsedFormatVersion = rawFormatVersion
        } else {
            parsedFormatVersion = "1.0"
        }

        // MARK: Skill ID format guard (after normalization)
        let skillIdRegex = try NSRegularExpression(pattern: validSkillIdPattern)
        let skillIdRange = NSRange(parsedId.startIndex..., in: parsedId)
        let skillIdMatchCount = skillIdRegex.numberOfMatches(in: parsedId, range: skillIdRange)
        guard skillIdMatchCount == 1 else {
            throw SkillParsingError.invalidSkillId(parsedId)
        }

        // MARK: Validate / default pointing_mode
        let parsedPointingMode: PointingMode
        if let rawPointingMode = keyValueMap["pointing_mode"], !rawPointingMode.isEmpty {
            let normalizedPointingMode = rawPointingMode.lowercased().replacingOccurrences(of: "_", with: "-")
            guard let resolvedPointingMode = PointingMode(rawValue: normalizedPointingMode) else {
                throw SkillParsingError.invalidPointingMode(rawPointingMode)
            }
            parsedPointingMode = resolvedPointingMode
        } else {
            parsedPointingMode = .always
        }

        // MARK: Optional fields
        let parsedMinAppVersion = keyValueMap["min_app_version"].flatMap { $0.isEmpty ? nil : $0 }
        let parsedRecommendedModel = firstNonEmptyValue(for: ["recommended_model", "model"])
            .flatMap { $0.isEmpty ? nil : $0 }
        let parsedDifficulty = keyValueMap["difficulty"].flatMap { $0.isEmpty ? nil : $0 }

        let parsedEstimatedHours: Int?
        if let rawEstimatedHours = keyValueMap["estimated_hours"], !rawEstimatedHours.isEmpty {
            parsedEstimatedHours = Int(rawEstimatedHours)
        } else {
            parsedEstimatedHours = nil
        }

        // MARK: Tags — stored as a comma-separated string, split back into an array here
        let parsedTags: [String]
        if let rawTagsCommaSeparated = keyValueMap["tags"], !rawTagsCommaSeparated.isEmpty {
            parsedTags = rawTagsCommaSeparated
                .components(separatedBy: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        } else {
            parsedTags = []
        }

        return SkillMetadata(
            id: parsedId,
            name: parsedName,
            shortDescription: parsedShortDescription,
            version: parsedVersion,
            formatVersion: parsedFormatVersion,
            minRuntimeVersion: parsedMinRuntimeVersion,
            author: parsedAuthor,
            license: parsedLicense,
            targetApp: parsedTargetApp,
            bundleId: firstNonEmptyValue(for: ["bundle_id", "bundleid", "target_bundle_id"])
                ?? inferredAppMapping?.bundleId
                ?? "generic.\(parsedId)",
            minAppVersion: parsedMinAppVersion,
            platform: parsedPlatform,
            recommendedModel: parsedRecommendedModel,
            pointingMode: parsedPointingMode,
            category: parsedCategory,
            tags: parsedTags,
            difficulty: parsedDifficulty,
            estimatedHours: parsedEstimatedHours
        )
    }
}
