// MARK: - Skilly
//
//  RustSkillsBridge.swift
//  leanring-buddy
//
//  Dynamic bridge for shared Rust skill prompt composition.
//  If the Rust dylib is not present, callers fall back to Swift composition logic.
//

import Darwin
import Foundation

@MainActor
final class RustSkillsBridge {
    static let shared = RustSkillsBridge()

    private struct RustSkillMetadataPayload: Encodable {
        let id: String
        let name: String
        let targetApp: String
        let pointingMode: String

        enum CodingKeys: String, CodingKey {
            case id
            case name
            case targetApp = "target_app"
            case pointingMode = "pointing_mode"
        }
    }

    private struct RustCurriculumStagePayload: Encodable {
        let id: String
        let name: String
        let goals: [String]
        let nextStageName: String?

        enum CodingKeys: String, CodingKey {
            case id
            case name
            case goals
            case nextStageName = "next_stage_name"
        }
    }

    private struct RustVocabularyEntryPayload: Encodable {
        let name: String
        let description: String
    }

    private struct RustSkillDefinitionPayload: Encodable {
        let metadata: RustSkillMetadataPayload
        let teachingInstructions: String
        let curriculumStages: [RustCurriculumStagePayload]
        let vocabularyEntries: [RustVocabularyEntryPayload]

        enum CodingKeys: String, CodingKey {
            case metadata
            case teachingInstructions = "teaching_instructions"
            case curriculumStages = "curriculum_stages"
            case vocabularyEntries = "vocabulary_entries"
        }
    }

    private struct RustSkillProgressPayload: Encodable {
        let currentStageID: String
        let completedStageIDs: [String]

        enum CodingKeys: String, CodingKey {
            case currentStageID = "current_stage_id"
            case completedStageIDs = "completed_stage_ids"
        }
    }

    private typealias RustComposePromptFunction = @convention(c) (
        UnsafePointer<CChar>?,  // base_prompt
        UnsafePointer<CChar>?,  // skill_definition_json
        UnsafePointer<CChar>?  // skill_progress_json
    ) -> UnsafeMutablePointer<CChar>?

    private typealias RustFreeStringFunction = @convention(c) (
        UnsafeMutablePointer<CChar>?  // raw_string
    ) -> Void

    private var dynamicLibraryHandle: UnsafeMutableRawPointer?
    private var composePromptFunction: RustComposePromptFunction?
    private var freeStringFunction: RustFreeStringFunction?
    private var hasAttemptedLibraryLoad = false

    private init() {
        loadRustSkillsLibraryIfNeeded()
    }

    func composePrompt(basePrompt: String, skill: SkillDefinition, progress: SkillProgress) -> String? {
        loadRustSkillsLibraryIfNeeded()
        guard let composePromptFunction, let freeStringFunction else { return nil }

        guard let skillDefinitionJSON = encodeSkillDefinitionJSON(skill: skill),
              let skillProgressJSON = encodeSkillProgressJSON(progress: progress) else {
            return nil
        }

        return basePrompt.withCString { basePromptPointer in
            skillDefinitionJSON.withCString { skillDefinitionJSONPointer in
                skillProgressJSON.withCString { skillProgressJSONPointer in
                    guard let rawComposedPrompt = composePromptFunction(
                        basePromptPointer,
                        skillDefinitionJSONPointer,
                        skillProgressJSONPointer
                    ) else {
                        return nil
                    }

                    defer {
                        freeStringFunction(rawComposedPrompt)
                    }
                    return String(cString: rawComposedPrompt)
                }
            }
        }
    }

    // MARK: - Library Loading

    private func loadRustSkillsLibraryIfNeeded() {
        guard composePromptFunction == nil else { return }
        guard !hasAttemptedLibraryLoad else { return }
        hasAttemptedLibraryLoad = true

        for dylibPath in candidateDynamicLibraryPaths() {
            guard FileManager.default.fileExists(atPath: dylibPath) else { continue }
            guard let dynamicLibraryHandle = dlopen(dylibPath, RTLD_NOW) else { continue }
            guard let composePromptSymbol = dlsym(dynamicLibraryHandle, "skilly_skills_compose_prompt_json"),
                  let freeStringSymbol = dlsym(dynamicLibraryHandle, "skilly_string_free") else {
                dlclose(dynamicLibraryHandle)
                continue
            }

            self.dynamicLibraryHandle = dynamicLibraryHandle
            self.composePromptFunction = unsafeBitCast(composePromptSymbol, to: RustComposePromptFunction.self)
            self.freeStringFunction = unsafeBitCast(freeStringSymbol, to: RustFreeStringFunction.self)
            #if DEBUG
            print("Skilly: Rust skills bridge loaded from \(dylibPath)")
            #endif
            return
        }

        #if DEBUG
        print("Skilly: Rust skills bridge unavailable, using Swift fallback")
        #endif
    }

    private func candidateDynamicLibraryPaths() -> [String] {
        let processEnvironment = ProcessInfo.processInfo.environment
        let envPolicyPath = processEnvironment["SKILLY_RUST_POLICY_DYLIB_PATH"]
        let envSkillsPath = processEnvironment["SKILLY_RUST_SKILLS_DYLIB_PATH"]
        let envCorePath = processEnvironment["SKILLY_RUST_CORE_DYLIB_PATH"]
        let infoPlistPath = AppBundleConfiguration.stringValue(forKey: "SKILLY_RUST_POLICY_DYLIB_PATH")
        let currentDirectoryPath = FileManager.default.currentDirectoryPath

        return [
            envSkillsPath,
            envCorePath,
            envPolicyPath,
            infoPlistPath,
            "\(currentDirectoryPath)/target/debug/libskilly_core_ffi.dylib",
            "\(currentDirectoryPath)/target/release/libskilly_core_ffi.dylib",
        ].compactMap { $0 }
    }

    // MARK: - JSON Encoding

    private func encodeSkillDefinitionJSON(skill: SkillDefinition) -> String? {
        let metadataPayload = RustSkillMetadataPayload(
            id: skill.metadata.id,
            name: skill.metadata.name,
            targetApp: skill.metadata.targetApp,
            pointingMode: skill.metadata.pointingMode.rawValue
        )

        let curriculumStagePayloads = skill.curriculumStages.map { curriculumStage in
            RustCurriculumStagePayload(
                id: curriculumStage.id,
                name: curriculumStage.name,
                goals: curriculumStage.goals,
                nextStageName: curriculumStage.nextStageName
            )
        }

        let vocabularyEntryPayloads = skill.vocabularyEntries.map { vocabularyEntry in
            RustVocabularyEntryPayload(
                name: vocabularyEntry.name,
                description: vocabularyEntry.description
            )
        }

        let skillDefinitionPayload = RustSkillDefinitionPayload(
            metadata: metadataPayload,
            teachingInstructions: skill.teachingInstructions,
            curriculumStages: curriculumStagePayloads,
            vocabularyEntries: vocabularyEntryPayloads
        )

        let jsonEncoder = JSONEncoder()
        guard let encodedData = try? jsonEncoder.encode(skillDefinitionPayload) else {
            return nil
        }
        return String(data: encodedData, encoding: .utf8)
    }

    private func encodeSkillProgressJSON(progress: SkillProgress) -> String? {
        let skillProgressPayload = RustSkillProgressPayload(
            currentStageID: progress.currentStageId,
            completedStageIDs: progress.completedStageIds
        )

        let jsonEncoder = JSONEncoder()
        guard let encodedData = try? jsonEncoder.encode(skillProgressPayload) else {
            return nil
        }
        return String(data: encodedData, encoding: .utf8)
    }
}
