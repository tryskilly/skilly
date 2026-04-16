// MARK: - Skilly
//
//  AdminAllowlist.swift
//  leanring-buddy
//
//  Long-term admin bypass keyed by stable WorkOS user IDs.
//  Users whose WorkOS IDs match the allowlist skip trial / usage /
//  entitlement gates entirely.
//
//  Used by:
//    - TrialTracker.isExhausted       (returns false for admins)
//    - UsageTracker.isOverCap          (returns false for admins)
//    - EntitlementManager.canStartTurn (returns (true, nil) for admins)
//
//  Admin IDs can come from:
//    1) Built-in allowlist below (source-controlled)
//    2) Info.plist key `SKILLY_ADMIN_WORKOS_USER_IDS`
//       (comma-separated list for deployment-time configuration)
//

import Foundation

enum AdminAllowlist {
    /// Built-in WorkOS user IDs that get unlimited access.
    /// Keep this list small and limited to trusted operators.
    static let adminWorkOSUserIDs: Set<String> = [
        "user_01KP21J3GEVH8AKJ31C59Z1KJQ",
    ]

    private static var infoPlistAdminWorkOSUserIDs: Set<String> {
        guard let configuredAdminIDs = AppBundleConfiguration.stringValue(forKey: "SKILLY_ADMIN_WORKOS_USER_IDS") else {
            return []
        }

        return Set(
            configuredAdminIDs
                .split(separator: ",")
                .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        )
    }

    private static var allAdminWorkOSUserIDs: Set<String> {
        adminWorkOSUserIDs.union(infoPlistAdminWorkOSUserIDs)
    }

    /// Whether the currently signed-in user is a Skilly admin.
    @MainActor
    static var isCurrentUserAdmin: Bool {
        guard let userID = AuthManager.shared.currentUser?.id else { return false }
        return allAdminWorkOSUserIDs.contains(userID)
    }
}
