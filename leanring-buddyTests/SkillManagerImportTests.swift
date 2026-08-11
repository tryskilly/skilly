// MARK: - Skilly

import Foundation
import Testing
@testable import Skilly

@MainActor
struct SkillManagerImportTests {
    @Test func importsDescriptivelyNamedMarkdownAsSkillMD() throws {
        let fileManager = FileManager.default
        let baseDirectoryURL = fileManager.temporaryDirectory
            .appendingPathComponent("skilly-import-test-\(UUID().uuidString)")
        let downloadsDirectoryURL = fileManager.temporaryDirectory
            .appendingPathComponent("skilly-download-test-\(UUID().uuidString)")
        defer {
            try? fileManager.removeItem(at: baseDirectoryURL)
            try? fileManager.removeItem(at: downloadsDirectoryURL)
        }

        try fileManager.createDirectory(at: downloadsDirectoryURL, withIntermediateDirectories: true)
        let downloadedSkillURL = downloadsDirectoryURL
            .appendingPathComponent("microsoft-excel-building-financial-models.md")
        try SkillDefinitionParserTests.minimalSkillMarkdown.write(
            to: downloadedSkillURL,
            atomically: true,
            encoding: .utf8
        )

        let manager = SkillManager(store: SkillStore(baseDirectoryPath: baseDirectoryURL.path))
        try manager.importSkill(from: downloadedSkillURL)

        let installedSkillURL = baseDirectoryURL
            .appendingPathComponent("skills/test-skill/SKILL.md")
        #expect(fileManager.fileExists(atPath: installedSkillURL.path))
        #expect(manager.installedSkills.map(\.metadata.id) == ["test-skill"])
        #expect(manager.activeSkill?.metadata.id == "test-skill")
    }

    @Test func rejectsNonMarkdownStandaloneFiles() throws {
        let fileManager = FileManager.default
        let baseDirectoryURL = fileManager.temporaryDirectory
            .appendingPathComponent("skilly-import-test-\(UUID().uuidString)")
        let textFileURL = fileManager.temporaryDirectory
            .appendingPathComponent("downloaded-skill-\(UUID().uuidString).txt")
        defer {
            try? fileManager.removeItem(at: baseDirectoryURL)
            try? fileManager.removeItem(at: textFileURL)
        }

        try SkillDefinitionParserTests.minimalSkillMarkdown.write(
            to: textFileURL,
            atomically: true,
            encoding: .utf8
        )

        let manager = SkillManager(store: SkillStore(baseDirectoryPath: baseDirectoryURL.path))
        #expect(throws: SkillManagerError.self) {
            try manager.importSkill(from: textFileURL)
        }
    }
}
