// MARK: - Skilly

import AppKit
import Combine

@MainActor
final class AppDetectionMonitor: ObservableObject {

    @Published private(set) var frontmostAppBundleId: String?

    let appDidChangePublisher = PassthroughSubject<String?, Never>()

    private var cancellables = Set<AnyCancellable>()
    private var debounceTimer: Timer?

    init() {
        startMonitoring()
    }

    private func startMonitoring() {
        updateFrontmostApp()

        NSWorkspace.shared.notificationCenter.publisher(
            for: NSWorkspace.didActivateApplicationNotification
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] notification in
            self?.handleAppActivation(notification)
        }
        .store(in: &cancellables)
    }

    private func handleAppActivation(_ notification: Notification) {
        debounceTimer?.invalidate()
        debounceTimer = Timer.scheduledTimer(
            withTimeInterval: 1.5,
            repeats: false
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.updateFrontmostApp()
            }
        }
    }

    private func updateFrontmostApp() {
        let bundleId = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
        frontmostAppBundleId = bundleId
        appDidChangePublisher.send(bundleId)
    }
}
