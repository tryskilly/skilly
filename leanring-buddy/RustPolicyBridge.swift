// MARK: - Skilly
//
//  RustPolicyBridge.swift
//  leanring-buddy
//
//  Dynamic bridge for shared Rust policy checks.
//  If the Rust dylib is not present, callers fall back to Swift policy logic.
//

import Darwin
import Foundation

@MainActor
final class RustPolicyBridge {
    static let shared = RustPolicyBridge()

    struct RustPolicyDecision {
        let allowed: Bool
        let reason: BlockReason?
        let isAdminUser: Bool
    }

    private enum RustPolicyEntitlementState: UInt8 {
        case none = 0
        case trial = 1
        case active = 2
        case canceledAccessStillValid = 3
        case canceledExpired = 4
        case expired = 5
    }

    private enum RustPolicyBlockReason: Int32 {
        case none = 255
        case trialExhausted = 0
        case capReached = 1
        case subscriptionInactive = 2
        case expired = 3
    }

    private typealias RustCanStartTurnFunction = @convention(c) (
        UnsafePointer<CChar>?,  // user_id
        UInt8,  // entitlement_state
        UInt64,  // trial_seconds_used
        UInt64,  // usage_seconds_used
        UnsafePointer<CChar>?  // admin_workos_user_ids_csv
    ) -> UInt64

    private typealias RustTrialIsExhaustedFunction = @convention(c) (
        UnsafePointer<CChar>?,  // user_id
        UInt64,  // trial_seconds_used
        UnsafePointer<CChar>?  // admin_workos_user_ids_csv
    ) -> UInt8

    private typealias RustUsageIsOverCapFunction = @convention(c) (
        UnsafePointer<CChar>?,  // user_id
        UInt64,  // usage_seconds_used
        UnsafePointer<CChar>?  // admin_workos_user_ids_csv
    ) -> UInt8

    private var dynamicLibraryHandle: UnsafeMutableRawPointer?
    private var canStartTurnFunction: RustCanStartTurnFunction?
    private var trialIsExhaustedFunction: RustTrialIsExhaustedFunction?
    private var usageIsOverCapFunction: RustUsageIsOverCapFunction?
    private var hasAttemptedLibraryLoad = false

    private init() {
        loadRustPolicyLibraryIfNeeded()
    }

    func canStartTurn(
        userID: String?,
        entitlementStatus: EntitlementStatus,
        trialSecondsUsed: TimeInterval,
        usageSecondsUsed: TimeInterval,
        adminWorkOSUserIDs: Set<String>
    ) -> RustPolicyDecision? {
        loadRustPolicyLibraryIfNeeded()
        guard let canStartTurnFunction else { return nil }

        let entitlementState = mapEntitlementState(entitlementStatus)
        let trialSecondsUsedInt = UInt64(max(0, trialSecondsUsed.rounded()))
        let usageSecondsUsedInt = UInt64(max(0, usageSecondsUsed.rounded()))
        let adminUserIDsCSV = adminWorkOSUserIDs.sorted().joined(separator: ",")

        return withOptionalCString(userID) { userIDPointer in
            if adminUserIDsCSV.isEmpty {
                let ffiDecision = canStartTurnFunction(
                    userIDPointer,
                    entitlementState.rawValue,
                    trialSecondsUsedInt,
                    usageSecondsUsedInt,
                    nil
                )
                return decodePolicyDecision(ffiDecision)
            } else {
                return adminUserIDsCSV.withCString { adminUserIDsPointer in
                    let ffiDecision = canStartTurnFunction(
                        userIDPointer,
                        entitlementState.rawValue,
                        trialSecondsUsedInt,
                        usageSecondsUsedInt,
                        adminUserIDsPointer
                    )
                    return decodePolicyDecision(ffiDecision)
                }
            }
        }
    }

    func trialIsExhausted(
        userID: String?,
        trialSecondsUsed: TimeInterval,
        adminWorkOSUserIDs: Set<String>
    ) -> Bool? {
        loadRustPolicyLibraryIfNeeded()
        guard let trialIsExhaustedFunction else { return nil }

        let trialSecondsUsedInt = UInt64(max(0, trialSecondsUsed.rounded()))
        let adminUserIDsCSV = adminWorkOSUserIDs.sorted().joined(separator: ",")

        return withOptionalCString(userID) { userIDPointer in
            if adminUserIDsCSV.isEmpty {
                return trialIsExhaustedFunction(userIDPointer, trialSecondsUsedInt, nil) != 0
            } else {
                return adminUserIDsCSV.withCString { adminUserIDsPointer in
                    trialIsExhaustedFunction(userIDPointer, trialSecondsUsedInt, adminUserIDsPointer) != 0
                }
            }
        }
    }

    func usageIsOverCap(
        userID: String?,
        usageSecondsUsed: TimeInterval,
        adminWorkOSUserIDs: Set<String>
    ) -> Bool? {
        loadRustPolicyLibraryIfNeeded()
        guard let usageIsOverCapFunction else { return nil }

        let usageSecondsUsedInt = UInt64(max(0, usageSecondsUsed.rounded()))
        let adminUserIDsCSV = adminWorkOSUserIDs.sorted().joined(separator: ",")

        return withOptionalCString(userID) { userIDPointer in
            if adminUserIDsCSV.isEmpty {
                return usageIsOverCapFunction(userIDPointer, usageSecondsUsedInt, nil) != 0
            } else {
                return adminUserIDsCSV.withCString { adminUserIDsPointer in
                    usageIsOverCapFunction(userIDPointer, usageSecondsUsedInt, adminUserIDsPointer) != 0
                }
            }
        }
    }

    // MARK: - Library Loading

    private func loadRustPolicyLibraryIfNeeded() {
        guard canStartTurnFunction == nil else { return }
        guard !hasAttemptedLibraryLoad else { return }
        hasAttemptedLibraryLoad = true

        for dylibPath in candidateDynamicLibraryPaths() {
            guard FileManager.default.fileExists(atPath: dylibPath) else { continue }
            guard let dynamicLibraryHandle = dlopen(dylibPath, RTLD_NOW) else { continue }
            guard let canStartTurnSymbol = dlsym(dynamicLibraryHandle, "skilly_policy_can_start_turn") else {
                dlclose(dynamicLibraryHandle)
                continue
            }

            self.dynamicLibraryHandle = dynamicLibraryHandle
            self.canStartTurnFunction = unsafeBitCast(canStartTurnSymbol, to: RustCanStartTurnFunction.self)
            if let trialIsExhaustedSymbol = dlsym(dynamicLibraryHandle, "skilly_policy_trial_is_exhausted") {
                self.trialIsExhaustedFunction = unsafeBitCast(
                    trialIsExhaustedSymbol,
                    to: RustTrialIsExhaustedFunction.self
                )
            }
            if let usageIsOverCapSymbol = dlsym(dynamicLibraryHandle, "skilly_policy_usage_is_over_cap") {
                self.usageIsOverCapFunction = unsafeBitCast(
                    usageIsOverCapSymbol,
                    to: RustUsageIsOverCapFunction.self
                )
            }
            #if DEBUG
            print("🦀 Skilly: Rust policy bridge loaded from \(dylibPath)")
            #endif
            return
        }

        #if DEBUG
        print("🦀 Skilly: Rust policy bridge unavailable, using Swift fallback")
        #endif
    }

    private func candidateDynamicLibraryPaths() -> [String] {
        let processEnvironment = ProcessInfo.processInfo.environment
        let envPath = processEnvironment["SKILLY_RUST_POLICY_DYLIB_PATH"]
        let infoPlistPath = AppBundleConfiguration.stringValue(forKey: "SKILLY_RUST_POLICY_DYLIB_PATH")
        let currentDirectoryPath = FileManager.default.currentDirectoryPath

        return [
            envPath,
            infoPlistPath,
            "\(currentDirectoryPath)/target/debug/libskilly_core_ffi.dylib",
            "\(currentDirectoryPath)/target/release/libskilly_core_ffi.dylib",
        ].compactMap { $0 }
    }

    // MARK: - Mapping

    private func mapEntitlementState(_ entitlementStatus: EntitlementStatus) -> RustPolicyEntitlementState {
        switch entitlementStatus {
        case .none:
            return .none
        case .trial:
            return .trial
        case .active:
            return .active
        case .canceled(let accessUntil):
            if accessUntil > Date() {
                return .canceledAccessStillValid
            }
            return .canceledExpired
        case .expired:
            return .expired
        }
    }

    private func decodePolicyDecision(_ encodedDecision: UInt64) -> RustPolicyDecision {
        let allowed = (encodedDecision & 0b1) != 0
        let isAdminUser = (encodedDecision & 0b10) != 0
        let reasonRaw = Int32((encodedDecision >> 8) & 0xFF)
        let blockReason = mapBlockReason(reasonRaw)
        return RustPolicyDecision(
            allowed: allowed,
            reason: blockReason,
            isAdminUser: isAdminUser
        )
    }

    private func mapBlockReason(_ rawReason: Int32) -> BlockReason? {
        guard let rustPolicyBlockReason = RustPolicyBlockReason(rawValue: rawReason) else {
            return nil
        }

        switch rustPolicyBlockReason {
        case .none:
            return nil
        case .trialExhausted:
            return .trialExhausted
        case .capReached:
            return .capReached
        case .subscriptionInactive:
            return .subscriptionInactive
        case .expired:
            return .expired
        }
    }

    private func withOptionalCString<T>(
        _ optionalString: String?,
        execute: (UnsafePointer<CChar>?) -> T
    ) -> T {
        guard let optionalString, !optionalString.isEmpty else {
            return execute(nil)
        }

        return optionalString.withCString { pointer in
            execute(pointer)
        }
    }
}
