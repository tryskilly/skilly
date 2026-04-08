// MARK: - Skilly
// Tests for local disk persistence of skills, progress, and config.

import Testing
import Foundation
@testable import leanring_buddy

struct SkillStoreTests {

    /// Creates a fresh temporary directory for an isolated test environment.
    /// The caller is responsible for calling cleanup(_:) when the test ends.
    private func makeTempBaseDirectory() throws -> URL {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillsight-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        return tempDir
    }

    /// Removes the given directory and all of its contents from disk.
    private func cleanup(_ directoryURL: URL) {
        try? FileManager.default.removeItem(at: directoryURL)
    }

    // MARK: - Test 1

    @Test func createsDirectoryStructureOnInit() throws {
        let baseDir = try makeTempBaseDirectory()
        defer { cleanup(baseDir) }

        let store = SkillStore(baseDirectoryPath: baseDir.path)
        store.ensureDirectoriesExist()

        let skillsDir = baseDir.appendingPathComponent("skills")
        let progressDir = baseDir.appendingPathComponent("progress")

        #expect(FileManager.default.fileExists(atPath: skillsDir.path))
        #expect(FileManager.default.fileExists(atPath: progressDir.path))
    }

    // MARK: - Test 2

    @Test func savesAndLoadsProgress() throws {
        let baseDir = try makeTempBaseDirectory()
        defer { cleanup(baseDir) }

        let store = SkillStore(baseDirectoryPath: baseDir.path)
        store.ensureDirectoriesExist()

        let progress = SkillProgress.createNew(
            skillId: "test-skill",
            skillVersion: "1.0.0",
            firstStageId: "stage-one"
        )

        try store.saveProgress(progress)
        let loadedProgress = try store.loadProgress(skillId: "test-skill")

        #expect(loadedProgress != nil)
        #expect(loadedProgress?.skillId == "test-skill")
        #expect(loadedProgress?.currentStageId == "stage-one")
    }

    // MARK: - Test 3

    @Test func returnsNilForNonexistentProgress() throws {
        let baseDir = try makeTempBaseDirectory()
        defer { cleanup(baseDir) }

        let store = SkillStore(baseDirectoryPath: baseDir.path)
        store.ensureDirectoriesExist()

        let loadedProgress = try store.loadProgress(skillId: "nonexistent")
        #expect(loadedProgress == nil)
    }

    // MARK: - Test 4

    @Test func loadsSkillFromDirectory() throws {
        let baseDir = try makeTempBaseDirectory()
        defer { cleanup(baseDir) }

        let store = SkillStore(baseDirectoryPath: baseDir.path)
        store.ensureDirectoriesExist()

        // Create a skill subdirectory containing a valid SKILL.md file
        let skillSubdirectoryURL = baseDir.appendingPathComponent("skills/test-skill")
        try FileManager.default.createDirectory(at: skillSubdirectoryURL, withIntermediateDirectories: true)
        try SkillDefinitionParserTests.minimalSkillMarkdown.write(
            to: skillSubdirectoryURL.appendingPathComponent("SKILL.md"),
            atomically: true,
            encoding: .utf8
        )

        let installedSkills = try store.loadInstalledSkills()
        #expect(installedSkills.count == 1)
        #expect(installedSkills[0].metadata.id == "test-skill")
    }

    // MARK: - Test 5

    @Test func savesAndLoadsConfig() throws {
        let baseDir = try makeTempBaseDirectory()
        defer { cleanup(baseDir) }

        let store = SkillStore(baseDirectoryPath: baseDir.path)
        store.ensureDirectoriesExist()

        let configToSave = SkillStoreConfig(version: 1, activeSkillId: "blender-fundamentals", analyticsOptOut: false)
        try store.saveConfig(configToSave)

        let loadedConfig = try store.loadConfig()
        #expect(loadedConfig.activeSkillId == "blender-fundamentals")
        #expect(!loadedConfig.analyticsOptOut)
    }

    // MARK: - Test 6

    @Test func deletesProgressFile() throws {
        let baseDir = try makeTempBaseDirectory()
        defer { cleanup(baseDir) }

        let store = SkillStore(baseDirectoryPath: baseDir.path)
        store.ensureDirectoriesExist()

        let progress = SkillProgress.createNew(
            skillId: "test-skill",
            skillVersion: "1.0.0",
            firstStageId: "stage-one"
        )
        try store.saveProgress(progress)
        try store.deleteProgress(skillId: "test-skill")

        let loadedProgress = try store.loadProgress(skillId: "test-skill")
        #expect(loadedProgress == nil)
    }
}
