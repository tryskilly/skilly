// MARK: - Skilly

import Combine
import Foundation
import SwiftUI

/// Central coordinator for all Skilly functionality.
///
/// SkillManager owns the active skill state, delegates curriculum processing to
/// CurriculumEngine, persists progress and config via SkillStore, and composes
/// the layered system prompt that gets injected into CompanionManager.
@MainActor
final class SkillManager: ObservableObject {

    // MARK: - Published State

    /// All skills currently installed in ~/.skilly/skills/.
    @Published private(set) var installedSkills: [SkillDefinition] = []

    /// The skill the user has chosen to practice, or nil when no skill is active.
    @Published private(set) var activeSkill: SkillDefinition?

    /// The learner's current progress through the active skill, or nil when no skill is active.
    @Published private(set) var activeSkillProgress: SkillProgress?

    /// When true, skill-augmented prompts are suppressed even if a skill is active.
    /// The user can pause without fully deactivating the skill.
    @Published private(set) var isSkillPaused: Bool = false

    // MARK: - Skilly
    @Published private(set) var frontmostAppBundleId: String?
    @Published var autoDetectionEnabled: Bool = true
    @Published private(set) var hasManuallySelectedSkill: Bool = false

    // MARK: - Skilly — Pinned Skills
    /// Set of skill IDs the user has pinned. Pinned skills stay visible in the
    /// "Active Now" panel even when the frontmost app doesn't match them.
    /// Persisted across launches via UserDefaults.
    @Published private(set) var pinnedSkillIds: Set<String> = {
        let stored = UserDefaults.standard.stringArray(forKey: "pinnedSkillIds") ?? []
        return Set(stored)
    }()

    /// Returns true if the given skill is pinned.
    func isPinned(_ skillId: String) -> Bool {
        pinnedSkillIds.contains(skillId)
    }

    /// Pins a skill so it appears in "Active Now" regardless of frontmost app.
    func pinSkill(_ skillId: String) {
        pinnedSkillIds.insert(skillId)
        UserDefaults.standard.set(Array(pinnedSkillIds), forKey: "pinnedSkillIds")
    }

    /// Unpins a skill. It will only appear in "Active Now" when auto-detection matches.
    func unpinSkill(_ skillId: String) {
        pinnedSkillIds.remove(skillId)
        UserDefaults.standard.set(Array(pinnedSkillIds), forKey: "pinnedSkillIds")
    }

    /// Toggles the pinned state of a skill.
    func togglePinned(_ skillId: String) {
        if isPinned(skillId) {
            unpinSkill(skillId)
        } else {
            pinSkill(skillId)
        }
    }

    // MARK: - Dependencies

    /// Processes voice interactions to detect mastery signals and advance curriculum stages.
    let curriculumEngine = CurriculumEngine()

    private let store: SkillStore
    // MARK: - Skilly
    private let appDetectionMonitor: AppDetectionMonitor
    private var cancellables = Set<AnyCancellable>()
    private var manualSelectionResetTimer: Timer?
    private static let manualSelectionResetInterval: TimeInterval = 30 * 60

    /// Holds the most-recently composed system prompt alongside its cache key so we
    /// can skip recomposition when the active skill and stage have not changed.
    private var promptCache = PromptCache()

    // MARK: - Init

    /// Factory method for creating a SkillManager with default dependencies.
    /// Required because SkillStore() and AppDetectionMonitor() are @MainActor-isolated
    /// and cannot be used as default parameter values in a non-static context.
    @MainActor
    static func createDefault() -> SkillManager {
        return SkillManager(store: SkillStore(), appDetectionMonitor: AppDetectionMonitor())
    }

    init(store: SkillStore = SkillStore()) {
        self.store = store
        self.appDetectionMonitor = AppDetectionMonitor()
        setupAppDetectionMonitoring()
    }

    init(store: SkillStore, appDetectionMonitor: AppDetectionMonitor) {
        self.store = store
        self.appDetectionMonitor = appDetectionMonitor
        setupAppDetectionMonitoring()
    }

    // MARK: - Loading

    /// Copies bundled example skills from the app bundle to ~/.skilly/skills/
    /// if they are not already installed. Called before loadInstalledSkills on first launch.
    func seedBundledSkillsIfNeeded() {
        store.seedBundledSkills()
    }

    /// Scans the skills directory, loads all installed skills, and restores the previously
    /// active skill from the persisted config.
    func loadInstalledSkills() {
        store.ensureDirectoriesExist()

        do {
            let loadedSkills = try store.loadInstalledSkills()
            installedSkills = loadedSkills
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("[SkillManager] Loaded \(loadedSkills.count) installed skill(s).")
            #endif

            // Restore the previously active skill so the user's session continues seamlessly.
            let savedConfig = (try? store.loadConfig()) ?? .default
            autoDetectionEnabled = savedConfig.autoDetectionEnabled
            hasManuallySelectedSkill = savedConfig.hasManuallySelectedSkill
            if let savedActiveSkillId = savedConfig.activeSkillId,
               let matchingSkill = loadedSkills.first(where: { $0.metadata.id == savedActiveSkillId }) {
                // Activate silently — no need to re-persist what is already persisted.
                activateSkill(matchingSkill, isManualSelection: false)
            } else if let frontmostAppBundleId, !frontmostAppBundleId.isEmpty {
                // If there is no persisted active skill, try immediate auto-detection
                // against the current frontmost app so newly installed matching skills
                // become active without requiring an app switch.
                autoDetectAndActivateSkill(frontmostAppBundleId: frontmostAppBundleId)
            }
        } catch {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("[SkillManager] Warning: Failed to load installed skills — \(error)")
            #endif
        }
    }

    // MARK: - Activation

    /// Makes the given skill active, loading or creating progress and handling version mismatches.
    ///
    /// If stored progress exists but has a version mismatch, we attempt a lightweight migration:
    /// when the stored stage IDs are still a subset of the new skill's stages we simply bump
    /// the version rather than resetting all progress.
    func activateSkill(_ skill: SkillDefinition, isManualSelection: Bool = true) {
        if isManualSelection {
            hasManuallySelectedSkill = true
            scheduleManualSelectionResetTimer()
        }

        activeSkill = skill
        isSkillPaused = false
        promptCache = PromptCache()

        // Load existing progress, or create fresh progress if none exists yet.
        var resolvedProgress: SkillProgress
        do {
            if var existingProgress = try store.loadProgress(skillId: skill.metadata.id) {
                if existingProgress.needsMigration(currentSkillVersion: skill.metadata.version) {
                    let newStageIds = skill.curriculumStages.map { $0.id }
                    let oldStageIds = existingProgress.completedStageIds + [existingProgress.currentStageId]

                    // If all old stage IDs still exist in the new skill, do a lightweight version bump
                    // rather than a destructive positional migration — the user's placement is intact.
                    let allOldStageIdsStillValid = oldStageIds.allSatisfy { newStageIds.contains($0) }
                    if allOldStageIdsStillValid {
                        existingProgress.skillVersion = skill.metadata.version
                        resolvedProgress = existingProgress
                        // MARK: - Skilly — Debug logging (stripped in release)
                        #if DEBUG
                        print("[SkillManager] Bumped skill version to \(skill.metadata.version) — stage IDs unchanged.")
                        #endif
                    } else {
                        resolvedProgress = existingProgress.migrateByPosition(
                            oldStageIds: oldStageIds,
                            newStageIds: newStageIds,
                            newSkillVersion: skill.metadata.version
                        )
                        // MARK: - Skilly — Debug logging (stripped in release)
                        #if DEBUG
                        print("[SkillManager] Migrated progress by position to skill version \(skill.metadata.version).")
                        #endif
                    }
                } else {
                    resolvedProgress = existingProgress
                }
            } else {
                // No saved progress — start the learner at the very first stage.
                let firstStageId = skill.curriculumStages.first?.id ?? ""
                resolvedProgress = SkillProgress.createNew(
                    skillId: skill.metadata.id,
                    skillVersion: skill.metadata.version,
                    firstStageId: firstStageId
                )
            }
        } catch {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("[SkillManager] Warning: Could not load progress for '\(skill.metadata.id)' — creating new. Error: \(error)")
            #endif
            let firstStageId = skill.curriculumStages.first?.id ?? ""
            resolvedProgress = SkillProgress.createNew(
                skillId: skill.metadata.id,
                skillVersion: skill.metadata.version,
                firstStageId: firstStageId
            )
        }

        activeSkillProgress = resolvedProgress
        persistActiveSkillId(skill.metadata.id)
    }

    /// Clears the active skill and all related state.
    func deactivateSkill() {
        hasManuallySelectedSkill = false
        manualSelectionResetTimer?.invalidate()
        manualSelectionResetTimer = nil
        deactivateCurrentSkill()
    }

    // MARK: - Skilly

    func deactivateCurrentSkill() {
        activeSkill = nil
        activeSkillProgress = nil
        isSkillPaused = false
        promptCache = PromptCache()
        persistActiveSkillId(nil)
    }

    /// Temporarily suppresses skill-augmented prompts without losing the active skill or progress.
    func pauseSkill() {
        isSkillPaused = true
    }

    /// Re-enables skill-augmented prompts after a pause.
    func resumeSkill() {
        isSkillPaused = false
    }

    // MARK: - Prompt Composition

    /// Returns the layered system prompt for the active skill, or nil when no skill is active or the
    /// skill is paused. Results are served from an in-memory cache when the skill and stage are unchanged.
    ///
    /// - Parameter basePrompt: The static system prompt that always appears first (Skilly's core identity).
    /// - Returns: The composed prompt string, or nil if no skill augmentation should be applied.
    func composedSystemPrompt(basePrompt: String) -> String? {
        guard !isSkillPaused,
              let currentActiveSkill = activeSkill,
              let currentActiveProgress = activeSkillProgress else {
            return nil
        }

        return SkillPromptComposer.compose(
            basePrompt: basePrompt,
            skill: currentActiveSkill,
            progress: currentActiveProgress,
            cache: &promptCache
        )
    }

    // MARK: - Curriculum Interaction

    /// Processes a completed voice interaction through the curriculum engine.
    ///
    /// If the engine advances the learner to a new stage, the prompt cache is invalidated
    /// so the next call to composedSystemPrompt reflects the new curriculum context.
    func didReceiveInteraction(transcript: String, assistantResponse: String) {
        guard let currentActiveSkill = activeSkill,
              let currentActiveProgress = activeSkillProgress else {
            return
        }

        let stageIdBeforeInteraction = currentActiveProgress.currentStageId

        let updatedProgress = curriculumEngine.processInteraction(
            transcript: transcript,
            assistantResponse: assistantResponse,
            skill: currentActiveSkill,
            progress: currentActiveProgress
        )

        activeSkillProgress = updatedProgress
        saveProgressToDisk(updatedProgress)

        // Invalidate the prompt cache when the stage advanced so the next prompt reflects
        // the learner's new position in the curriculum.
        if updatedProgress.currentStageId != stageIdBeforeInteraction {
            promptCache = PromptCache()
        }
    }

    /// Manually places the learner on a specific stage, bypassing signal accumulation.
    func manuallySetCurrentStage(stageId: String) {
        guard let currentActiveProgress = activeSkillProgress else { return }

        let updatedProgress = curriculumEngine.manuallySetStage(
            stageId: stageId,
            progress: currentActiveProgress
        )

        activeSkillProgress = updatedProgress
        saveProgressToDisk(updatedProgress)
        promptCache = PromptCache()
    }

    /// Explicitly marks a stage as complete and advances the learner if appropriate.
    func markStageComplete(stageId: String) {
        guard let currentActiveSkill = activeSkill,
              let currentActiveProgress = activeSkillProgress else {
            return
        }

        let updatedProgress = curriculumEngine.markStageComplete(
            stageId: stageId,
            skill: currentActiveSkill,
            progress: currentActiveProgress
        )

        activeSkillProgress = updatedProgress
        saveProgressToDisk(updatedProgress)
        promptCache = PromptCache()
    }

    /// Resets all learner progress for the active skill back to the first stage.
    func resetProgress() {
        guard let currentActiveSkill = activeSkill,
              let currentActiveProgress = activeSkillProgress else {
            return
        }

        let firstStageId = currentActiveSkill.curriculumStages.first?.id ?? ""
        let resetSkillProgress = curriculumEngine.resetProgress(
            progress: currentActiveProgress,
            firstStageId: firstStageId
        )

        activeSkillProgress = resetSkillProgress
        saveProgressToDisk(resetSkillProgress)
        promptCache = PromptCache()
    }

    // MARK: - Entitlements

    enum SkillAccessError: LocalizedError {
        case entitlementBlocked(BlockReason)

        var errorDescription: String? {
            switch self {
            case .entitlementBlocked(let reason):
                return reason.displayMessage
            }
        }
    }

    func canAccessSkill(_ skill: SkillDefinition) -> (allowed: Bool, error: SkillAccessError?) {
        let (allowed, reason) = EntitlementManager.shared.canStartTurn()
        if !allowed {
            return (false, .entitlementBlocked(reason ?? .subscriptionInactive))
        }
        return (true, nil)
    }

    // MARK: - Skilly

    func autoDetectAndActivateSkill(frontmostAppBundleId: String) {
        guard autoDetectionEnabled else { return }

        if hasManuallySelectedSkill {
            scheduleManualSelectionResetTimer()
            return
        }

        let normalizedFrontmostAppBundleId = frontmostAppBundleId.lowercased()
        let matchingSkill = installedSkills.first {
            $0.metadata.bundleId.lowercased() == normalizedFrontmostAppBundleId
        }

        if let matchingSkill {
            if activeSkill?.metadata.id != matchingSkill.metadata.id {
                activateSkill(matchingSkill, isManualSelection: false)
            }
        } else {
            deactivateCurrentSkill()
        }
    }

    func importSkillFromDirectory(_ directoryURL: URL) throws {
        let fileManager = FileManager.default
        let skillMarkdownFileURL = directoryURL.appendingPathComponent("SKILL.md")

        guard fileManager.fileExists(atPath: skillMarkdownFileURL.path) else {
            throw SkillManagerError.missingSkillFile(directoryURL.path)
        }

        let rawSkillContent = try String(contentsOf: skillMarkdownFileURL, encoding: .utf8)
        let parsedSkill = try SkillDefinition.parse(
            from: rawSkillContent,
            sourceDirectoryPath: directoryURL.path
        )

        let validationResult = SkillValidation.validate(skill: parsedSkill, rawContent: rawSkillContent)
        guard validationResult.isValid else {
            throw SkillManagerError.validationFailed(validationResult.violations)
        }

        store.ensureDirectoriesExist()
        let installedSkillDirectoryURL = URL(fileURLWithPath: store.baseDirectoryPath)
            .appendingPathComponent("skills")
            .appendingPathComponent(parsedSkill.metadata.id)

        if fileManager.fileExists(atPath: installedSkillDirectoryURL.path) {
            try fileManager.removeItem(at: installedSkillDirectoryURL)
        }

        try fileManager.copyItem(at: directoryURL, to: installedSkillDirectoryURL)
        loadInstalledSkills()

        // Immediately activate the imported skill so users get visible feedback
        // that the import worked.
        if let importedSkill = installedSkills.first(where: { $0.metadata.id == parsedSkill.metadata.id }) {
            activateSkill(importedSkill, isManualSelection: true)
        }
    }

    @discardableResult
    func importSkillFromDirectory(at url: URL) throws -> SkillDefinition? {
        let directoryName = url.lastPathComponent
        try importSkillFromDirectory(url)
        return installedSkills.first(where: {
            $0.metadata.id == directoryName || $0.sourceDirectoryPath?.contains(directoryName) == true
        })
    }

    func importSkillFromURL(_ urlString: String) async throws {
        guard let skillMarkdownURL = URL(string: urlString) else {
            throw SkillManagerError.invalidURL(urlString)
        }

        let (downloadedData, _) = try await URLSession.shared.data(from: skillMarkdownURL)
        guard let rawSkillContent = String(data: downloadedData, encoding: .utf8) else {
            throw SkillManagerError.invalidSkillEncoding
        }

        let parsedSkill = try SkillDefinition.parse(from: rawSkillContent)
        let validationResult = SkillValidation.validate(skill: parsedSkill, rawContent: rawSkillContent)
        guard validationResult.isValid else {
            throw SkillManagerError.validationFailed(validationResult.violations)
        }

        store.ensureDirectoriesExist()
        let fileManager = FileManager.default
        let installedSkillDirectoryURL = URL(fileURLWithPath: store.baseDirectoryPath)
            .appendingPathComponent("skills")
            .appendingPathComponent(parsedSkill.metadata.id)

        if fileManager.fileExists(atPath: installedSkillDirectoryURL.path) {
            try fileManager.removeItem(at: installedSkillDirectoryURL)
        }

        try fileManager.createDirectory(at: installedSkillDirectoryURL, withIntermediateDirectories: true)
        let destinationSkillMarkdownFileURL = installedSkillDirectoryURL.appendingPathComponent("SKILL.md")
        try rawSkillContent.write(to: destinationSkillMarkdownFileURL, atomically: true, encoding: .utf8)

        loadInstalledSkills()

        // Immediately activate the imported skill so users get visible feedback
        // that the import worked.
        if let importedSkill = installedSkills.first(where: { $0.metadata.id == parsedSkill.metadata.id }) {
            activateSkill(importedSkill, isManualSelection: true)
        }
    }

    @discardableResult
    func importSkillFromURL(_ urlString: String) throws -> SkillDefinition? {
        guard let parsedURL = URL(string: urlString) else {
            throw SkillManagerError.invalidURL(urlString)
        }

        guard parsedURL.isFileURL else {
            throw SkillManagerError.synchronousImportSupportsOnlyFileURLs(urlString)
        }

        return try importSkillFromDirectory(at: parsedURL)
    }

    func setAutoDetectionEnabled(_ enabled: Bool) {
        autoDetectionEnabled = enabled
        persistActiveSkillId(activeSkill?.metadata.id)
        if enabled,
           !hasManuallySelectedSkill,
           let frontmostAppBundleId,
           !frontmostAppBundleId.isEmpty {
            autoDetectAndActivateSkill(frontmostAppBundleId: frontmostAppBundleId)
        }
    }

    func removeSkill(skillId: String) throws {
        let wasRemovingActiveSkill = activeSkill?.metadata.id == skillId

        if wasRemovingActiveSkill {
            hasManuallySelectedSkill = false
            manualSelectionResetTimer?.invalidate()
            manualSelectionResetTimer = nil
            deactivateCurrentSkill()
        }

        try store.deleteInstalledSkill(skillId: skillId)
        try store.deleteProgress(skillId: skillId)
        loadInstalledSkills()

        if wasRemovingActiveSkill,
           autoDetectionEnabled,
           let frontmostAppBundleId,
           !frontmostAppBundleId.isEmpty {
            autoDetectAndActivateSkill(frontmostAppBundleId: frontmostAppBundleId)
        }
    }

    // MARK: - Private Helpers

    // MARK: - Skilly

    private func setupAppDetectionMonitoring() {
        handleFrontmostAppBundleIdChange(appDetectionMonitor.frontmostAppBundleId)

        appDetectionMonitor.appDidChangePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newFrontmostAppBundleId in
                self?.handleFrontmostAppBundleIdChange(newFrontmostAppBundleId)
            }
            .store(in: &cancellables)
    }

    private func handleFrontmostAppBundleIdChange(_ newFrontmostAppBundleId: String?) {
        frontmostAppBundleId = newFrontmostAppBundleId

        guard let newFrontmostAppBundleId, !newFrontmostAppBundleId.isEmpty else {
            if hasManuallySelectedSkill {
                scheduleManualSelectionResetTimer()
            } else {
                deactivateCurrentSkill()
            }
            return
        }

        autoDetectAndActivateSkill(frontmostAppBundleId: newFrontmostAppBundleId)
    }

    private func scheduleManualSelectionResetTimer() {
        manualSelectionResetTimer?.invalidate()
        manualSelectionResetTimer = Timer.scheduledTimer(
            withTimeInterval: Self.manualSelectionResetInterval,
            repeats: false
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.hasManuallySelectedSkill = false
                self.manualSelectionResetTimer = nil
                self.persistActiveSkillId(self.activeSkill?.metadata.id)

                if let frontmostAppBundleId = self.frontmostAppBundleId,
                   !frontmostAppBundleId.isEmpty {
                    self.autoDetectAndActivateSkill(frontmostAppBundleId: frontmostAppBundleId)
                }
            }
        }
    }

    /// Saves the given progress to disk, printing a warning on failure rather than crashing.
    private func saveProgressToDisk(_ progress: SkillProgress) {
        do {
            try store.saveProgress(progress)
        } catch {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("[SkillManager] Warning: Could not save progress for '\(progress.skillId)' — \(error)")
            #endif
        }
    }

    /// Persists the active skill ID (or nil for no active skill) to the app config file.
    private func persistActiveSkillId(_ skillId: String?) {
        do {
            var currentConfig = (try? store.loadConfig()) ?? .default
            currentConfig.activeSkillId = skillId
            currentConfig.autoDetectionEnabled = autoDetectionEnabled
            currentConfig.hasManuallySelectedSkill = hasManuallySelectedSkill
            try store.saveConfig(currentConfig)
        } catch {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("[SkillManager] Warning: Could not persist active skill ID — \(error)")
            #endif
        }
    }
}

// MARK: - Skilly

enum SkillManagerError: LocalizedError {
    case missingSkillFile(String)
    case invalidURL(String)
    case invalidSkillEncoding
    case validationFailed([String])
    case synchronousImportSupportsOnlyFileURLs(String)

    var errorDescription: String? {
        switch self {
        case .missingSkillFile(let directoryPath):
            return "No SKILL.md file found at: \(directoryPath)"
        case .invalidURL(let value):
            return "Invalid URL: \(value)"
        case .invalidSkillEncoding:
            return "Downloaded skill content is not valid UTF-8 text"
        case .validationFailed(let violations):
            return "Skill validation failed: \(violations.joined(separator: "; "))"
        case .synchronousImportSupportsOnlyFileURLs(let value):
            return "Synchronous import only supports file URLs: \(value)"
        }
    }
}
