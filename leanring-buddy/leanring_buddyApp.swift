//
//  leanring_buddyApp.swift
//  leanring-buddy
//
//  Menu bar-only companion app. No dock icon, no main window — just an
//  always-available status item in the macOS menu bar. Clicking the icon
//  opens a floating panel with companion voice controls.
//

import ServiceManagement
import SwiftUI
import Sparkle

@main
struct leanring_buddyApp: App {
    @NSApplicationDelegateAdaptor(CompanionAppDelegate.self) var appDelegate

    var body: some Scene {
        // The app lives entirely in the menu bar panel managed by the AppDelegate.
        // This empty Settings scene satisfies SwiftUI's requirement for at least
        // one scene but is never shown (LSUIElement=true removes the app menu).
        Settings {
            EmptyView()
        }
    }
}

/// Manages the companion lifecycle: creates the menu bar panel and starts
/// the companion voice pipeline on launch.
@MainActor
final class CompanionAppDelegate: NSObject, NSApplicationDelegate {
    private var menuBarPanelManager: MenuBarPanelManager?
    private let companionManager = CompanionManager()
    private var sparkleUpdaterController: SPUStandardUpdaterController?

    // MARK: - Skilly
    private let skillManager = SkillManager.createDefault()
    let authManager = AuthManager.shared

    func applicationDidFinishLaunching(_ notification: Notification) {
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🎯 Skilly: Starting...")
        print("🎯 Skilly: Version \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown")")
        #endif

        UserDefaults.standard.register(defaults: ["NSInitialToolTipDelay": 0])

        SkillyAnalytics.configure()
        SkillyAnalytics.trackAppOpened()
        SkillyNotificationManager.shared.requestAuthorization()

        // Inject skill manager into companion and panel
        companionManager.setSkillManager(skillManager)
        skillManager.seedBundledSkillsIfNeeded()
        skillManager.loadInstalledSkills()

        // Register for skilly:// deep links (WorkOS auth callback)
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleURLEvent(_:withReply:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )

        menuBarPanelManager = MenuBarPanelManager(
            companionManager: companionManager,
            skillManager: skillManager,
            authManager: authManager
        )
        companionManager.start()
        if authManager.isAuthenticated {
            Task { await EntitlementManager.shared.refresh() }
        }
        // Auto-open the panel if the user still needs to do something:
        // either they haven't onboarded yet, or permissions were revoked.
        if !companionManager.hasCompletedOnboarding || !companionManager.allPermissionsGranted {
            menuBarPanelManager?.showPanelOnLaunch()
        }
        registerAsLoginItemIfNeeded()
        // startSparkleUpdater()
    }

    func applicationWillTerminate(_ notification: Notification) {
        companionManager.stop()
    }

    /// Registers the app as a login item so it launches automatically on
    /// startup. Uses SMAppService which shows the app in System Settings >
    /// General > Login Items, letting the user toggle it off if they want.
    private func registerAsLoginItemIfNeeded() {
        let loginItemService = SMAppService.mainApp
        if loginItemService.status != .enabled {
            do {
                try loginItemService.register()
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("🎯 Skilly: Registered as login item")
                #endif
            } catch {
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("⚠️ Skilly: Failed to register as login item: \(error)")
                #endif
            }
        }
    }

    // MARK: - Deep Link Handler (WorkOS Auth Callback)

    @objc private func handleURLEvent(_ event: NSAppleEventDescriptor, withReply reply: NSAppleEventDescriptor) {
        guard let urlString = event.paramDescriptor(forKeyword: AEKeyword(keyDirectObject))?.stringValue,
              let url = URL(string: urlString),
              url.scheme == "skilly" else {
            return
        }

        // MARK: - Skilly — Handle checkout-success deep link
        // After paying on Polar, the success page has an "Open Skilly"
        // button that links to skilly://checkout-success. Refresh the
        // entitlement so the PlanStrip updates without a relaunch.
        if url.host == "checkout-success" {
            #if DEBUG
            print("🎯 Skilly: Received checkout-success deep link, refreshing entitlement")
            #endif
            Task { await EntitlementManager.shared.refresh() }
            return
        }

        guard url.host == "auth",
              url.path == "/callback" || url.path == "callback" else {
            return
        }

        // Extract the authorization code from the callback URL
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        guard let code = components?.queryItems?.first(where: { $0.name == "code" })?.value else {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("⚠️ Skilly Auth: No code in callback URL")
            #endif
            return
        }

        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🎯 Skilly Auth: Received auth callback with code")
        #endif
        let state = components?.queryItems?.first(where: { $0.name == "state" })?.value
        authManager.handleAuthCallback(code: code, state: state)
        Task { await EntitlementManager.shared.refresh() }
    }

    private func startSparkleUpdater() {
        let updaterController = SPUStandardUpdaterController(
            startingUpdater: false,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
        self.sparkleUpdaterController = updaterController

        do {
            try updaterController.updater.start()
        } catch {
            // MARK: - Skilly — Debug logging (stripped in release)
            #if DEBUG
            print("⚠️ Skilly: Sparkle updater failed to start: \(error)")
            #endif
        }
    }
}
