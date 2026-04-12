import Foundation
import UserNotifications

@MainActor
final class SkillyNotificationManager {
    static let shared = SkillyNotificationManager()

    private init() {}

    func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            #if DEBUG
            if let error {
                print("Skilly Notifications: authorization failed — \(error)")
            } else {
                print("Skilly Notifications: authorized=\(granted)")
            }
            #endif
        }
    }

    func checkAndSendTrial80PercentWarning() {
        guard TrialTracker.shared.remainingSeconds <= 180 else { return }
        guard !hasSentTrial80Notification() else { return }
        markTrial80NotificationSent()
        sendNotification(
            title: "Trial Ending Soon",
            body: "You have 3 minutes left in your free trial. Subscribe to keep learning.",
            identifier: "trial_80_warning"
        )
    }

    func checkAndSendUsage80PercentWarning() {
        guard UsageTracker.shared.usageProgress >= 0.8 else { return }
        guard !hasSentUsage80Notification() else { return }
        markUsage80NotificationSent()
        sendNotification(
            title: "Monthly Usage Warning",
            body: "You've used 80% of your 3-hour monthly limit. 36 minutes remaining.",
            identifier: "usage_80_warning"
        )
    }

    private func sendNotification(title: String, body: String, identifier: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            #if DEBUG
            if let error {
                print("Skilly Notifications: failed to deliver — \(error)")
            }
            #endif
        }
    }

    private func hasSentTrial80Notification() -> Bool {
        guard let userId = AuthManager.shared.currentUser?.id else { return false }
        return UserDefaults.standard.bool(forKey: "trial_80_notification_sent_\(userId)")
    }

    private func markTrial80NotificationSent() {
        guard let userId = AuthManager.shared.currentUser?.id else { return }
        UserDefaults.standard.set(true, forKey: "trial_80_notification_sent_\(userId)")
    }

    private func hasSentUsage80Notification() -> Bool {
        guard let userId = AuthManager.shared.currentUser?.id else { return false }
        return UserDefaults.standard.bool(forKey: "usage_80_notification_sent_\(userId)")
    }

    private func markUsage80NotificationSent() {
        guard let userId = AuthManager.shared.currentUser?.id else { return }
        UserDefaults.standard.set(true, forKey: "usage_80_notification_sent_\(userId)")
    }
}
