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

// MARK: - CurriculumStageTests

struct CurriculumStageTests {

    // MARK: Test Fixtures

    /// A complete Stage 1 block with all fields populated and no prerequisites.
    private let completeStage1Block = """
    ### Stage 1: Getting Around

    Learn to navigate the application interface confidently without getting lost.

    **Goals:**
    - Open and close the main panel
    - Switch between primary views

    **Completion signals:** opens panel, closes panel, switches views, uses keyboard shortcut, navigates back
    **Next:** Core Editing
    """

    /// A Stage 3 block that includes a **Prerequisites:** field.
    private let stage3BlockWithPrerequisites = """
    ### Stage 3: Advanced Techniques

    Dive into power-user workflows that rely on mastery of earlier stages.

    **Goals:**
    - Use batch operations

    **Completion signals:** batch applied
    **Prerequisites:** Core Editing
    **Next:** null
    """

    /// A final stage block whose **Next:** value is "null".
    private let finalStageBlock = """
    ### Stage 5: Mastery

    Refine and internalize everything covered in the curriculum.

    **Goals:**
    - Complete a full project without assistance

    **Completion signals:** project completed
    **Next:** null
    """

    // MARK: Test 1

    @Test func parsesStageFromMarkdownBlock() throws {
        let parsedStage = try CurriculumStage.parse(from: completeStage1Block, stageIndex: 0)

        #expect(parsedStage.id == "getting-around")
        #expect(parsedStage.name == "Getting Around")
        #expect(parsedStage.stageNumber == 1)
        #expect(!parsedStage.description.isEmpty)
        #expect(parsedStage.goals.count == 2)
        #expect(parsedStage.completionSignals.count == 5)
        #expect(parsedStage.nextStageName == "Core Editing")
        #expect(parsedStage.prerequisites == nil)
    }

    // MARK: Test 2

    @Test func parsesStageWithPrerequisites() throws {
        let parsedStage = try CurriculumStage.parse(from: stage3BlockWithPrerequisites, stageIndex: 2)

        #expect(parsedStage.prerequisites == "Core Editing")
    }

    // MARK: Test 3

    @Test func parsesFinalStageWithNullNext() throws {
        let parsedStage = try CurriculumStage.parse(from: finalStageBlock, stageIndex: 4)

        #expect(parsedStage.nextStageName == nil)
    }

    // MARK: Test 4

    @Test func generatesStableIdFromStageName() {
        let generatedId = CurriculumStage.idFromName("Non-Destructive Modifiers")

        #expect(generatedId == "non-destructive-modifiers")
    }
}

// MARK: - VocabularyEntryTests

struct VocabularyEntryTests {

    // MARK: Test 1

    @Test func parsesVocabularyEntryFromMarkdownBlock() throws {
        let singleParagraphBlock = """
        ### Mode Selector
        Dropdown in the toolbar that switches between photo editing modes.
        """

        let parsedEntry = try VocabularyEntry.parse(from: singleParagraphBlock)

        #expect(parsedEntry.name == "Mode Selector")
        #expect(parsedEntry.description.contains("Dropdown"))
        #expect(parsedEntry.description.contains("toolbar"))
    }

    // MARK: Test 2

    @Test func trimsWhitespaceFromDescription() throws {
        let multiParagraphBlock = """
        ### Histogram Panel

        A graph showing the tonal distribution of your image.
        Read it left-to-right from shadows to highlights.

        Use it to judge exposure without relying on the monitor calibration.
        """

        let parsedEntry = try VocabularyEntry.parse(from: multiParagraphBlock)

        // The two paragraphs should be joined by a double newline.
        let paragraphs = parsedEntry.description.components(separatedBy: "\n\n")
        #expect(paragraphs.count == 2)

        // Leading/trailing whitespace must be stripped.
        #expect(parsedEntry.description == parsedEntry.description.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}
