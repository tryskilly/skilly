//
//  CaptureActivityIndicatorWindow.swift
//  leanring-buddy
//
//  A small, persistent, non-activating control shown while Skilly is
//  capturing or handling a turn. It stays above the cursor overlay and gives
//  the user an immediate, visible stop action without stealing app focus.
//

import AppKit
import Combine
import SwiftUI

@MainActor
final class CaptureActivityIndicatorWindowController {
    private let companionManager: CompanionManager
    private let panel: NSPanel
    private var stateSubscription: AnyCancellable?

    init(companionManager: CompanionManager) {
        self.companionManager = companionManager
        self.panel = Self.makePanel(companionManager: companionManager)

        stateSubscription = companionManager.objectWillChange.sink { [weak self] _ in
            DispatchQueue.main.async {
                self?.synchronizeVisibility()
            }
        }

        synchronizeVisibility()
    }

    private static func makePanel(companionManager: CompanionManager) -> NSPanel {
        let size = NSSize(width: 350, height: 62)
        let panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.screenSaver.rawValue + 1)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        panel.isFloatingPanel = true
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isExcludedFromWindowsMenu = true
        panel.isReleasedWhenClosed = false
        panel.contentView = NSHostingView(
            rootView: CaptureActivityIndicatorView(companionManager: companionManager)
        )
        return panel
    }

    private func synchronizeVisibility() {
        guard let state = companionManager.activityIndicatorState else {
            panel.orderOut(nil)
            return
        }

        positionPanelNearMenuBar()
        if !panel.isVisible {
            SkillyAnalytics.trackCaptureIndicatorShown(mode: state.analyticsMode)
        }
        panel.orderFrontRegardless()
    }

    private func positionPanelNearMenuBar() {
        let mouseLocation = NSEvent.mouseLocation
        let screen = NSScreen.screens.first(where: { $0.frame.contains(mouseLocation) }) ?? NSScreen.main
        guard let visibleFrame = screen?.visibleFrame else { return }

        let x = visibleFrame.midX - (panel.frame.width / 2)
        let y = visibleFrame.maxY - panel.frame.height - 12
        panel.setFrameOrigin(NSPoint(x: x, y: y))
    }
}

private struct CaptureActivityIndicatorView: View {
    @ObservedObject var companionManager: CompanionManager

    var body: some View {
        if let state = companionManager.activityIndicatorState {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(state.isCapturing ? DS.Colors.destructive.opacity(0.18) : DS.Colors.accentSubtle)
                        .frame(width: 30, height: 30)

                    Image(systemName: state.isCapturing ? "record.circle.fill" : "sparkles")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(state.isCapturing ? DS.Colors.destructive : DS.Colors.accentText)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(state.title)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(DS.Colors.textPrimary)

                    Text(state.detail)
                        .font(.system(size: 10))
                        .foregroundColor(DS.Colors.textSecondary)
                }

                Spacer(minLength: 4)

                Button("Stop") {
                    companionManager.stopActiveInteraction(source: "indicator_button")
                }
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(DS.Colors.textPrimary)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                        .fill(DS.Colors.destructive.opacity(0.18))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous)
                        .stroke(DS.Colors.destructive.opacity(0.5), lineWidth: 0.5)
                )
                .pointerCursor()
                .accessibilityLabel("Stop Skilly")
                .accessibilityHint("Stops microphone capture, screen activity, processing, and audio playback")
            }
            .padding(.horizontal, 14)
            .frame(width: 350, height: 58)
            .background(
                RoundedRectangle(cornerRadius: DS.CornerRadius.extraLarge, style: .continuous)
                    .fill(DS.Colors.background.opacity(0.97))
                    .overlay(
                        RoundedRectangle(cornerRadius: DS.CornerRadius.extraLarge, style: .continuous)
                            .stroke(DS.Colors.borderStrong, lineWidth: 0.5)
                    )
                    .shadow(color: Color.black.opacity(0.4), radius: 14, x: 0, y: 6)
            )
            .preferredColorScheme(.dark)
        }
    }
}
