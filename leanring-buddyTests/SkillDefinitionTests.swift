// MARK: - Skilly

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
author: Skilly Team
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
        #expect(parsedMetadata.author == "Skilly Team")
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

    @Test func derivesSkillIdWhenFrontmatterIdIsMissing() throws {
        // External SKILL.md formats frequently omit `id`; we derive it from `name`.
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

        let parsedMetadata = try SkillMetadata.parse(from: frontmatterMissingId)
        #expect(parsedMetadata.id == "my-skill")
    }

    // MARK: Test 4

    @Test func fallsBackToSupportedFormatVersionWhenUnrecognized() throws {
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

        let parsedMetadata = try SkillMetadata.parse(from: frontmatterWithUnsupportedVersion)
        #expect(parsedMetadata.formatVersion == "1.0")
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

    @Test func normalizesInvalidSkillId() throws {
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

        let parsedMetadata = try SkillMetadata.parse(from: frontmatterWithInvalidId)
        #expect(parsedMetadata.id == "invalid-id-with-spaces")
    }

    // MARK: Test 7

    @Test func parsesQuotedScalarValuesInFrontmatter() throws {
        let quotedFrontmatter = """
        ---
        id: "blender-fundamentals"
        name: "Blender Fundamentals"
        version: "0.1.0"
        format_version: "1.0"
        min_runtime_version: "1.0.0"
        author: "moelabs"
        license: "MIT"
        target_app: "Blender"
        bundle_id: "org.blenderfoundation.blender"
        min_app_version: "4.0"
        platform: "macOS"
        recommended_model: "claude-sonnet-4-6"
        pointing_mode: "always"
        category: "creative-tools"
        tags:
          - "3d-modeling"
          - "blender"
        difficulty: "beginner"
        estimated_hours: "8"
        ---
        """

        let parsedMetadata = try SkillMetadata.parse(from: quotedFrontmatter)

        #expect(parsedMetadata.id == "blender-fundamentals")
        #expect(parsedMetadata.formatVersion == "1.0")
        #expect(parsedMetadata.minRuntimeVersion == "1.0.0")
        #expect(parsedMetadata.pointingMode == .always)
        #expect(parsedMetadata.tags == ["3d-modeling", "blender"])
        #expect(parsedMetadata.estimatedHours == 8)
    }

    // MARK: Test 8

    @Test func parsesMinimalExternalSkillFrontmatter() throws {
        let externalSkillFrontmatter = """
        ---
        name: Ask Claude
        description: Ask Claude via local CLI and capture a reusable artifact
        ---
        """

        let parsedMetadata = try SkillMetadata.parse(from: externalSkillFrontmatter)

        #expect(parsedMetadata.id == "ask-claude")
        #expect(parsedMetadata.name == "Ask Claude")
        #expect(parsedMetadata.shortDescription == "Ask Claude via local CLI and capture a reusable artifact")
        #expect(parsedMetadata.version == "1.0.0")
        #expect(parsedMetadata.targetApp == "General")
        #expect(parsedMetadata.bundleId == "generic.ask-claude")
    }

    // MARK: Test 9

    @Test func parsesTagArraysWithFlexibleIndentation() throws {
        let flexibleIndentationFrontmatter = """
        ---
        name: Flexible Tags
        tags:
        - swift
        - macos
        ---
        """

        let parsedMetadata = try SkillMetadata.parse(from: flexibleIndentationFrontmatter)
        #expect(parsedMetadata.id == "flexible-tags")
        #expect(parsedMetadata.tags == ["swift", "macos"])
    }

    // MARK: Test 10

    @Test func infersFigmaTargetAppAndBundleIdFromSkillNamePrefix() throws {
        let figmaSkillFrontmatter = """
        ---
        name: figma-implement-design
        description: Implements Figma designs in code
        ---
        """

        let parsedMetadata = try SkillMetadata.parse(from: figmaSkillFrontmatter)
        #expect(parsedMetadata.id == "figma-implement-design")
        #expect(parsedMetadata.targetApp == "Figma")
        #expect(parsedMetadata.bundleId == "com.figma.Desktop")
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

// MARK: - SkillDefinitionParserTests

struct SkillDefinitionParserTests {

    // MARK: Test Fixtures

    /// A minimal but complete SKILL.md for testing all parser sections.
    static let minimalSkillMarkdown = """
    ---
    id: test-skill
    name: Test Skill
    version: 1.0.0
    format_version: 1.0
    min_runtime_version: 1.0.0
    author: tester
    license: MIT
    target_app: TestApp
    bundle_id: com.test.app
    platform: macOS
    recommended_model: claude-sonnet-4-6
    pointing_mode: always
    category: test
    tags:
      - testing
    difficulty: beginner
    estimated_hours: 2
    ---

    # Test Skill

    This is the skill description for marketplace listing.

    ## Teaching Instructions

    You are teaching TestApp basics.

    ### Your Expertise

    You know TestApp deeply.

    ### Teaching Approach

    Be patient and clear.

    ## Curriculum

    ### Stage 1: First Steps

    Learn the basics.

    **Goals:**
    - Open the app
    - Find the main menu

    **Completion signals:** open, menu, basics

    **Next:** Advanced Steps

    ### Stage 2: Advanced Steps

    Go deeper.

    **Prerequisites:** First Steps

    **Goals:**
    - Use advanced feature

    **Completion signals:** advanced, feature

    **Next:** null

    ## UI Vocabulary

    ### Main Menu
    The top menu bar of TestApp with File, Edit, View options.

    ### Sidebar
    The left panel showing project navigation and file tree.
    """

    // MARK: Test 1

    @Test func parsesCompleteSkillFromMarkdown() throws {
        let parsedDefinition = try SkillDefinition.parse(from: Self.minimalSkillMarkdown)

        #expect(parsedDefinition.metadata.id == "test-skill")
        #expect(parsedDefinition.metadata.name == "Test Skill")
        #expect(parsedDefinition.skillDescription == "This is the skill description for marketplace listing.")
    }

    // MARK: Test 2

    @Test func extractsTeachingInstructionsVerbatim() throws {
        let parsedDefinition = try SkillDefinition.parse(from: Self.minimalSkillMarkdown)
        let teachingInstructions = parsedDefinition.teachingInstructions

        // The top-level prose must be present.
        #expect(teachingInstructions.contains("You are teaching TestApp basics."))

        // Nested H3 headings must be preserved verbatim inside the teaching instructions block.
        #expect(teachingInstructions.contains("### Your Expertise"))
        #expect(teachingInstructions.contains("### Teaching Approach"))

        // Content under nested headings must also be preserved.
        #expect(teachingInstructions.contains("Be patient and clear."))
    }

    // MARK: Test 3

    @Test func parsesTwoCurriculumStages() throws {
        let parsedDefinition = try SkillDefinition.parse(from: Self.minimalSkillMarkdown)
        let stages = parsedDefinition.curriculumStages

        #expect(stages.count == 2)

        let firstStage = stages[0]
        #expect(firstStage.name == "First Steps")
        #expect(firstStage.goals.count == 2)
        #expect(firstStage.nextStageName == "Advanced Steps")

        let secondStage = stages[1]
        #expect(secondStage.name == "Advanced Steps")
        #expect(secondStage.prerequisites == "First Steps")
        #expect(secondStage.nextStageName == nil)
    }

    // MARK: Test 4

    @Test func parsesTwoVocabularyEntries() throws {
        let parsedDefinition = try SkillDefinition.parse(from: Self.minimalSkillMarkdown)
        let entries = parsedDefinition.vocabularyEntries

        #expect(entries.count == 2)
        #expect(entries[0].name == "Main Menu")
        #expect(entries[1].name == "Sidebar")
    }

    // MARK: Test 5

    @Test func rejectsMissingFrontmatter() {
        // A document with no --- delimiters at all should fail with a SkillParsingError.
        let markdownWithoutFrontmatter = """
        # No Frontmatter Here

        Just plain markdown content with no YAML block.

        ## Teaching Instructions

        Some instructions.
        """

        #expect(throws: SkillParsingError.self) {
            try SkillDefinition.parse(from: markdownWithoutFrontmatter)
        }
    }

    // MARK: Test 6

    @Test func fallsBackToBodyWhenTeachingInstructionsSectionIsMissing() throws {
        // Valid frontmatter + Curriculum section, but no Teaching Instructions section.
        let markdownMissingTeachingInstructions = """
        ---
        id: test-skill
        name: Test Skill
        version: 1.0.0
        format_version: 1.0
        min_runtime_version: 1.0.0
        author: tester
        license: MIT
        target_app: TestApp
        bundle_id: com.test.app
        platform: macOS
        category: test
        ---

        Skill description here.

        ## Curriculum

        ### Stage 1: Only Stage

        Learn something.

        **Goals:**
        - Do the thing

        **Completion signals:** done

        **Next:** null
        """

        let parsedDefinition = try SkillDefinition.parse(from: markdownMissingTeachingInstructions)
        #expect(parsedDefinition.teachingInstructions.contains("Skill description here."))
        #expect(parsedDefinition.curriculumStages.count == 1)
    }

    // MARK: Test 7

    @Test func parsesStandardExternalSkillShapeWithoutSkillySections() throws {
        let externalSkillMarkdown = """
        ---
        name: Ask Claude
        description: Ask Claude via local CLI and capture a reusable artifact
        ---

        # Ask Claude

        Run Claude with a concrete question and summarize the output.

        ## Usage

        - Keep prompts focused.
        - Save reusable snippets.
        """

        let parsedDefinition = try SkillDefinition.parse(from: externalSkillMarkdown)

        #expect(parsedDefinition.metadata.id == "ask-claude")
        #expect(parsedDefinition.skillDescription == "Ask Claude via local CLI and capture a reusable artifact")
        #expect(parsedDefinition.teachingInstructions.contains("Run Claude with a concrete question"))
        #expect(parsedDefinition.teachingInstructions.contains("## Usage"))
        #expect(parsedDefinition.curriculumStages.isEmpty)
        #expect(parsedDefinition.vocabularyEntries.isEmpty)
    }
}

// MARK: - Blender Skill Validation

struct BlenderSkillValidationTests {

    @Test func blenderSkillParsesSuccessfully() throws {
        let skillPath = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("skills/blender-fundamentals/SKILL.md")

        guard FileManager.default.fileExists(atPath: skillPath.path) else {
            return // Skip if file not found (CI may not have it)
        }

        let content = try String(contentsOf: skillPath, encoding: .utf8)
        let skill = try SkillDefinition.parse(from: content)

        #expect(skill.metadata.id == "blender-fundamentals")
        #expect(skill.metadata.targetApp == "Blender")
        #expect(skill.curriculumStages.count == 6)
        #expect(skill.vocabularyEntries.count >= 10)
        #expect(skill.metadata.pointingMode == .always)
        #expect(skill.curriculumStages[0].name == "Getting Around")
        #expect(skill.curriculumStages[5].name == "Your First Render")
        #expect(skill.curriculumStages[5].nextStageName == nil)
    }
}
