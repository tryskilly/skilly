// MARK: - SkillSight

import Testing
@testable import leanring_buddy

// MARK: - Test Fixtures

/// A complete, valid YAML frontmatter block used as the baseline for most tests.
private let completeValidFrontmatter = """
---
id: xcode-debugger
name: Xcode Debugger
version: 1.2.3
format_version: 1.0
min_runtime_version: 1.0.0
author: SkillSight Team
license: MIT
target_app: Xcode
bundle_id: com.apple.dt.Xcode
min_app_version: 15.0
platform: macOS
recommended_model: claude-sonnet-4-6
pointing_mode: always
category: debugging
tags:
  - swift
  - xcode
  - debugging
difficulty: intermediate
estimated_hours: 4
---
"""

// MARK: - SkillMetadataTests

struct SkillMetadataTests {

    // MARK: Test 1

    @Test func parsesRequiredFieldsFromYAMLFrontmatter() throws {
        let parsedMetadata = try SkillMetadata.parse(from: completeValidFrontmatter)

        #expect(parsedMetadata.id == "xcode-debugger")
        #expect(parsedMetadata.name == "Xcode Debugger")
        #expect(parsedMetadata.version == "1.2.3")
        #expect(parsedMetadata.formatVersion == "1.0")
        #expect(parsedMetadata.minRuntimeVersion == "1.0.0")
        #expect(parsedMetadata.author == "SkillSight Team")
        #expect(parsedMetadata.license == "MIT")
        #expect(parsedMetadata.targetApp == "Xcode")
        #expect(parsedMetadata.bundleId == "com.apple.dt.Xcode")
        #expect(parsedMetadata.minAppVersion == "15.0")
        #expect(parsedMetadata.platform == "macOS")
        #expect(parsedMetadata.recommendedModel == "claude-sonnet-4-6")
        #expect(parsedMetadata.pointingMode == .always)
        #expect(parsedMetadata.category == "debugging")
        #expect(parsedMetadata.tags == ["swift", "xcode", "debugging"])
        #expect(parsedMetadata.difficulty == "intermediate")
        #expect(parsedMetadata.estimatedHours == 4)
    }

    // MARK: Test 2

    @Test func defaultsPointingModeToAlwaysWhenOmitted() throws {
        // A minimal valid frontmatter that omits the pointing_mode field entirely.
        let frontmatterWithoutPointingMode = """
        ---
        id: my-skill
        name: My Skill
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
        """

        let parsedMetadata = try SkillMetadata.parse(from: frontmatterWithoutPointingMode)

        #expect(parsedMetadata.pointingMode == .always)
    }

    // MARK: Test 3

    @Test func rejectsYAMLMissingRequiredField() throws {
        // A frontmatter that is otherwise valid but omits the required 'id' field.
        let frontmatterMissingId = """
        ---
        name: My Skill
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
        """

        #expect(throws: SkillParsingError.self) {
            try SkillMetadata.parse(from: frontmatterMissingId)
        }
    }

    // MARK: Test 4

    @Test func rejectsUnrecognizedFormatVersion() throws {
        let frontmatterWithUnsupportedVersion = """
        ---
        id: my-skill
        name: My Skill
        version: 1.0.0
        format_version: 99.0
        min_runtime_version: 1.0.0
        author: Test Author
        license: MIT
        target_app: TestApp
        bundle_id: com.example.testapp
        platform: macOS
        category: productivity
        ---
        """

        #expect(throws: SkillParsingError.self) {
            try SkillMetadata.parse(from: frontmatterWithUnsupportedVersion)
        }
    }

    // MARK: Test 5

    @Test func parsesAllThreePointingModes() throws {
        let pointingModeTestCases: [(rawValue: String, expectedCase: PointingMode)] = [
            ("always", .always),
            ("when-relevant", .whenRelevant),
            ("minimal", .minimal),
        ]

        for testCase in pointingModeTestCases {
            let frontmatterWithPointingMode = """
            ---
            id: my-skill
            name: My Skill
            version: 1.0.0
            format_version: 1.0
            min_runtime_version: 1.0.0
            author: Test Author
            license: MIT
            target_app: TestApp
            bundle_id: com.example.testapp
            platform: macOS
            category: productivity
            pointing_mode: \(testCase.rawValue)
            ---
            """

            let parsedMetadata = try SkillMetadata.parse(from: frontmatterWithPointingMode)
            #expect(parsedMetadata.pointingMode == testCase.expectedCase)
        }
    }

    // MARK: Test 6

    @Test func rejectsInvalidSkillId() throws {
        let frontmatterWithInvalidId = """
        ---
        id: INVALID ID WITH SPACES!
        name: My Skill
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
        """

        #expect(throws: SkillParsingError.self) {
            try SkillMetadata.parse(from: frontmatterWithInvalidId)
        }
    }
}
