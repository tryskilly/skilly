// MARK: - Skilly
// Local disk persistence for installed skills, learning progress, and
// app configuration. All data stored under ~/.skilly/ as JSON files.

import Foundation

// MARK: - SkillStoreConfig

/// App-level configuration stored in ~/.skilly/config.json.
struct SkillStoreConfig: Codable, Sendable {
    var version: Int
    var activeSkillId: String?
    var analyticsOptOut: Bool
    // MARK: - Skilly
    var autoDetectionEnabled: Bool
    var hasManuallySelectedSkill: Bool

    // MARK: - Skilly
    static let `default` = SkillStoreConfig(
        version: 1,
        activeSkillId: nil,
        analyticsOptOut: false,
        autoDetectionEnabled: true,
        hasManuallySelectedSkill: false
    )

    init(
        version: Int,
        activeSkillId: String?,
        analyticsOptOut: Bool,
        autoDetectionEnabled: Bool,
        hasManuallySelectedSkill: Bool
    ) {
        self.version = version
        self.activeSkillId = activeSkillId
        self.analyticsOptOut = analyticsOptOut
        self.autoDetectionEnabled = autoDetectionEnabled
        self.hasManuallySelectedSkill = hasManuallySelectedSkill
    }

    // MARK: - Backward-compatible decoding

    enum CodingKeys: String, CodingKey {
        case version
        case activeSkillId
        case analyticsOptOut
        case autoDetectionEnabled
        case hasManuallySelectedSkill
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
        self.activeSkillId = try container.decodeIfPresent(String.self, forKey: .activeSkillId)
        self.analyticsOptOut = try container.decodeIfPresent(Bool.self, forKey: .analyticsOptOut) ?? false
        self.autoDetectionEnabled = try container.decodeIfPresent(Bool.self, forKey: .autoDetectionEnabled) ?? true
        self.hasManuallySelectedSkill = try container.decodeIfPresent(Bool.self, forKey: .hasManuallySelectedSkill) ?? false
    }
}

// MARK: - SkillStore

/// Manages reading and writing all Skilly data to the local file system.
///
/// Directory layout:
///   ~/.skilly/
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

    /// Default base directory for all Skilly data: ~/.skilly/
    static let defaultBaseDirectoryPath: String = {
        let homeDirectory = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(homeDirectory)/.skilly"
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

            do {
                let markdownContent = try String(contentsOfFile: skillFilePath, encoding: .utf8)
                let parsedSkill = try SkillDefinition.parse(
                    from: markdownContent,
                    sourceDirectoryPath: subdirectoryURL.path
                )
                installedSkills.append(parsedSkill)
            } catch {
                #if DEBUG
                print("[SkillStore] Skipping invalid skill at '\(skillFilePath)': \(error)")
                #endif
            }
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

    // MARK: - Skill Deletion

    /// Deletes an installed skill directory at ~/.skilly/skills/{skillId}.
    /// No-ops if the directory is already missing.
    func deleteInstalledSkill(skillId: String) throws {
        let installedSkillDirectoryPath = "\(skillsDirectoryPath)/\(skillId)"
        if FileManager.default.fileExists(atPath: installedSkillDirectoryPath) {
            try FileManager.default.removeItem(atPath: installedSkillDirectoryPath)
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

    // MARK: - Skilly — Bundled Skill Seeding

    /// Copies any bundled example skills from the app bundle's "Skills" resource folder
    /// into ~/.skilly/skills/ if they are not already installed.
    /// This is called on first launch to provide out-of-the-box skill content.
    /// Existing skills are never overwritten — this only copies skills that don't exist yet.
    func seedBundledSkills() {
        let fileManager = FileManager.default
        let skillsDir = URL(fileURLWithPath: skillsDirectoryPath)

        // Try both "Skills" and "skills" — the folder name depends on how
        // it was added to the Xcode project (folder reference preserves case).
        let bundledSkillsURL: URL? = {
            let resource = Bundle.main.resourceURL
            for name in ["Skills", "skills"] {
                if let url = resource?.appendingPathComponent(name),
                   FileManager.default.fileExists(atPath: url.path) {
                    return url
                }
            }
            return nil
        }()
        guard let bundledSkillsURL else { return }

        guard let bundledSkillDirs = try? fileManager.contentsOfDirectory(
            at: bundledSkillsURL,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else { return }

        for bundledSkillDir in bundledSkillDirs {
            let isDirectory = (try? bundledSkillDir.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
            guard isDirectory else { continue }

            let skillFileURL = bundledSkillDir.appendingPathComponent("SKILL.md")
            guard fileManager.fileExists(atPath: skillFileURL.path) else { continue }

            let destinationDir = skillsDir.appendingPathComponent(bundledSkillDir.lastPathComponent)

            if fileManager.fileExists(atPath: destinationDir.path) { continue }
            do {
                // Copy the entire bundled skill directory in one step.
                // Pre-creating destinationDir makes copyItem fail because the destination must not exist.
                try fileManager.copyItem(at: bundledSkillDir, to: destinationDir)
            } catch {
                #if DEBUG
                print("[SkillStore] Failed to seed bundled skill '\(bundledSkillDir.lastPathComponent)': \(error)")
                #endif
            }
        }
    }
}
