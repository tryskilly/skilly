// MARK: - Skilly
//
//  RustRealtimeBridge.swift
//  leanring-buddy
//
//  Dynamic bridge for shared Rust realtime turn/session transitions.
//  If the Rust dylib is unavailable, callers fall back to Swift lifecycle behavior.
//

import Darwin
import Foundation

@MainActor
final class RustRealtimeBridge {
    static let shared = RustRealtimeBridge()

    enum RealtimeEventType: String, Codable {
        case turnStarted = "turn_started"
        case audioCaptureCommitted = "audio_capture_committed"
        case responseStarted = "response_started"
        case audioPlaybackStarted = "audio_playback_started"
        case responseCompleted = "response_completed"
        case sessionError = "session_error"
        case sessionReset = "session_reset"
    }

    struct RealtimeEventPayload: Codable {
        let type: String
        let turnID: String?
        let message: String?

        enum CodingKeys: String, CodingKey {
            case type
            case turnID = "turn_id"
            case message
        }
    }

    struct RealtimeReplaySummary: Decodable {
        let phaseName: String
        let turnsCompleted: Int

        enum CodingKeys: String, CodingKey {
            case phaseName = "phase_name"
            case turnsCompleted = "turns_completed"
        }
    }

    private typealias RustReplayEventsFunction = @convention(c) (
        UnsafePointer<CChar>?  // events_json
    ) -> UnsafeMutablePointer<CChar>?

    private typealias RustFreeStringFunction = @convention(c) (
        UnsafeMutablePointer<CChar>?  // raw_string
    ) -> Void

    private var dynamicLibraryHandle: UnsafeMutableRawPointer?
    private var replayEventsFunction: RustReplayEventsFunction?
    private var freeStringFunction: RustFreeStringFunction?
    private var hasAttemptedLibraryLoad = false

    private init() {
        loadRustRealtimeLibraryIfNeeded()
    }

    func makeEvent(
        type: RealtimeEventType,
        turnID: String? = nil,
        message: String? = nil
    ) -> RealtimeEventPayload {
        RealtimeEventPayload(
            type: type.rawValue,
            turnID: turnID,
            message: message
        )
    }

    func replaySummary(events: [RealtimeEventPayload]) -> RealtimeReplaySummary? {
        loadRustRealtimeLibraryIfNeeded()
        guard let replayEventsFunction, let freeStringFunction else { return nil }

        let jsonEncoder = JSONEncoder()
        guard let encodedEventsData = try? jsonEncoder.encode(events),
              let encodedEventsJSON = String(data: encodedEventsData, encoding: .utf8) else {
            return nil
        }

        return encodedEventsJSON.withCString { encodedEventsPointer in
            guard let rawSummaryJSON = replayEventsFunction(encodedEventsPointer) else {
                return nil
            }

            defer {
                freeStringFunction(rawSummaryJSON)
            }

            let summaryJSON = String(cString: rawSummaryJSON)
            guard let summaryData = summaryJSON.data(using: .utf8) else {
                return nil
            }
            return try? JSONDecoder().decode(RealtimeReplaySummary.self, from: summaryData)
        }
    }

    // MARK: - Library Loading

    private func loadRustRealtimeLibraryIfNeeded() {
        guard replayEventsFunction == nil else { return }
        guard !hasAttemptedLibraryLoad else { return }
        hasAttemptedLibraryLoad = true

        for dylibPath in candidateDynamicLibraryPaths() {
            guard FileManager.default.fileExists(atPath: dylibPath) else { continue }
            guard let dynamicLibraryHandle = dlopen(dylibPath, RTLD_NOW) else { continue }
            guard let replayEventsSymbol = dlsym(dynamicLibraryHandle, "skilly_realtime_replay_events_json"),
                  let freeStringSymbol = dlsym(dynamicLibraryHandle, "skilly_string_free") else {
                dlclose(dynamicLibraryHandle)
                continue
            }

            self.dynamicLibraryHandle = dynamicLibraryHandle
            self.replayEventsFunction = unsafeBitCast(replayEventsSymbol, to: RustReplayEventsFunction.self)
            self.freeStringFunction = unsafeBitCast(freeStringSymbol, to: RustFreeStringFunction.self)
            #if DEBUG
            print("Skilly: Rust realtime bridge loaded from \(dylibPath)")
            #endif
            return
        }

        #if DEBUG
        print("Skilly: Rust realtime bridge unavailable, using Swift fallback")
        #endif
    }

    private func candidateDynamicLibraryPaths() -> [String] {
        let processEnvironment = ProcessInfo.processInfo.environment
        let envRealtimePath = processEnvironment["SKILLY_RUST_REALTIME_DYLIB_PATH"]
        let envCorePath = processEnvironment["SKILLY_RUST_CORE_DYLIB_PATH"]
        let envPolicyPath = processEnvironment["SKILLY_RUST_POLICY_DYLIB_PATH"]
        let infoPlistPath = AppBundleConfiguration.stringValue(forKey: "SKILLY_RUST_POLICY_DYLIB_PATH")
        let currentDirectoryPath = FileManager.default.currentDirectoryPath

        return [
            envRealtimePath,
            envCorePath,
            envPolicyPath,
            infoPlistPath,
            "\(currentDirectoryPath)/target/debug/libskilly_core_ffi.dylib",
            "\(currentDirectoryPath)/target/release/libskilly_core_ffi.dylib",
        ].compactMap { $0 }
    }
}
