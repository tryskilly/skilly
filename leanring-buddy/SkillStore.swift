// MARK: - Skilly
// Local disk persistence for installed skills, learning progress, and
// app configuration. All data stored under ~/.skillsight/ as JSON files.

import Foundation

// MARK: - SkillStoreConfig

/// App-level configuration stored in ~/.skillsight/config.json.
struct SkillStoreConfig: Codable, Sendable {
    var version: Int
    var activeSkillId: String?
    var analyticsOptOut: Bool

    static let `default` = SkillStoreConfig(version: 1, activeSkillId: nil, analyticsOptOut: false)
}

// MARK: - SkillStore

/// Manages reading and writing all Skilly data to the local file system.
///
/// Directory layout:
///   ~/.skillsight/
///     skills/           — one subdirectory per installed skill, each containing SKILL.md
///     progress/         — one JSON file per skill: {skillId}.json
///     config.json       — app-level configuration
final class SkillStore: Sendable {
    let baseDirectoryPath: String

    /// Path to the directory containing installed skill subdirectories.
    private var skillsDirectoryPath: String { "\(baseDirectoryPath)/skills" }

    /// Path to the directory containing per-skill progress JSON files.
    private var progressDirectoryPath: String { "\(baseDirectoryPath)/progress" }

    /// Path to the app-level config JSON file.
    private var configFilePath: String { "\(baseDirectoryPath)/config.json" }

    /// Default base directory for all Skilly data: ~/.skillsight/
    static let defaultBaseDirectoryPath: String = {
        let homeDirectory = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(homeDirectory)/.skillsight"
    }()

    init(baseDirectoryPath: String = SkillStore.defaultBaseDirectoryPath) {
        self.baseDirectoryPath = baseDirectoryPath
    }

    // MARK: - Directory Setup

    /// Creates the required directory structure under baseDirectoryPath if it does not already exist.
    /// Safe to call multiple times — existing directories are left untouched.
    func ensureDirectoriesExist() {
        let fileManager = FileManager.default
        for path in [baseDirectoryPath, skillsDirectoryPath, progressDirectoryPath] {
            if !fileManager.fileExists(atPath: path) {
                try? fileManager.createDirectory(atPath: path, withIntermediateDirectories: true)
            }
        }
    }

    // MARK: - Skill Loading

    /// Scans the skills/ directory for installed skills. Each subdirectory must contain a SKILL.md
    /// file. Subdirectories without SKILL.md are silently skipped.
    ///
    /// - Returns: All successfully parsed SkillDefinitions found on disk.
    /// - Throws: File-system or parsing errors if a SKILL.md exists but cannot be read or parsed.
    func loadInstalledSkills() throws -> [SkillDefinition] {
        let fileManager = FileManager.default
        let skillsURL = URL(fileURLWithPath: skillsDirectoryPath)

        guard fileManager.fileExists(atPath: skillsDirectoryPath) else {
            return []
        }

        let subdirectoryURLs = try fileManager.contentsOfDirectory(
            at: skillsURL,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        )

        var installedSkills: [SkillDefinition] = []

        for subdirectoryURL in subdirectoryURLs {
            let isDirectory = (try? subdirectoryURL.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
            guard isDirectory else { continue }

            let skillFilePath = subdirectoryURL.appendingPathComponent("SKILL.md").path
            guard fileManager.fileExists(atPath: skillFilePath) else { continue }

            let markdownContent = try String(contentsOfFile: skillFilePath, encoding: .utf8)
            let parsedSkill = try SkillDefinition.parse(
                from: markdownContent,
                sourceDirectoryPath: subdirectoryURL.path
            )
            installedSkills.append(parsedSkill)
        }

        return installedSkills
    }

    // MARK: - Progress Persistence

    /// Encodes the given SkillProgress to JSON and writes it to progress/{skillId}.json.
    /// - Throws: Encoding or file-write errors.
    func saveProgress(_ progress: SkillProgress) throws {
        let progressFilePath = "\(progressDirectoryPath)/\(progress.skillId).json"
        let encodedData = try JSONEncoder().encode(progress)
        try encodedData.write(to: URL(fileURLWithPath: progressFilePath))
    }

    /// Loads and decodes the SkillProgress for the given skill from progress/{skillId}.json.
    ///
    /// - Returns: The decoded SkillProgress, or nil if no file exists for this skillId.
    /// - Throws: File-read or decoding errors if the file exists but cannot be decoded.
    func loadProgress(skillId: String) throws -> SkillProgress? {
        let progressFilePath = "\(progressDirectoryPath)/\(skillId).json"
        guard FileManager.default.fileExists(atPath: progressFilePath) else {
            return nil
        }
        let encodedData = try Data(contentsOf: URL(fileURLWithPath: progressFilePath))
        return try JSONDecoder().decode(SkillProgress.self, from: encodedData)
    }

    /// Deletes the progress file for the given skillId. No-ops if the file does not exist.
    /// - Throws: File-system errors if the file exists but cannot be removed.
    func deleteProgress(skillId: String) throws {
        let progressFilePath = "\(progressDirectoryPath)/\(skillId).json"
        if FileManager.default.fileExists(atPath: progressFilePath) {
            try FileManager.default.removeItem(atPath: progressFilePath)
        }
    }

    // MARK: - Config Persistence

    /// Encodes the given SkillStoreConfig to JSON and writes it to config.json.
    /// - Throws: Encoding or file-write errors.
    func saveConfig(_ config: SkillStoreConfig) throws {
        let encodedData = try JSONEncoder().encode(config)
        try encodedData.write(to: URL(fileURLWithPath: configFilePath))
    }

    /// Loads and decodes the SkillStoreConfig from config.json.
    ///
    /// - Returns: The decoded config, or SkillStoreConfig.default if no config file exists yet.
    /// - Throws: File-read or decoding errors if the file exists but cannot be decoded.
    func loadConfig() throws -> SkillStoreConfig {
        guard FileManager.default.fileExists(atPath: configFilePath) else {
            return .default
        }
        let encodedData = try Data(contentsOf: URL(fileURLWithPath: configFilePath))
        return try JSONDecoder().decode(SkillStoreConfig.self, from: encodedData)
    }
}
