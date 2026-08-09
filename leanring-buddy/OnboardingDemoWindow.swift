//
//  OnboardingDemoWindow.swift
//  leanring-buddy
//
//  A permission-free first-run surface large enough to demonstrate Skilly's
//  screen understanding and pointer before macOS asks for sensitive access.
//

import AppKit
import AVFoundation
import SwiftUI

enum PermissionDemoStage: Int, Comparable {
    case ready
    case thinking
    case pointing
    case answering
    case complete

    static func < (lhs: PermissionDemoStage, rhs: PermissionDemoStage) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

struct OnboardingDemoView: View {
    let onContinue: (_ source: String) -> Void

    @State private var stage: PermissionDemoStage = .ready
    @State private var audioPlayer: AVAudioPlayer?
    @State private var isMuted = false

    var body: some View {
        VStack(spacing: 0) {
            windowHeader

            VStack(spacing: 18) {
                VStack(spacing: 6) {
                    Text("See Skilly before you share your screen")
                        .font(.system(size: 27, weight: .bold, design: .rounded))
                        .foregroundColor(DS.Colors.textPrimary)

                    Text("Ask a sample question and watch Skilly find the right control. This preview cannot see or hear your Mac.")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(DS.Colors.textSecondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 540)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                demoSurface

                actionArea
            }
            .padding(.horizontal, 30)
            .padding(.top, 18)
            .padding(.bottom, 22)
        }
        .frame(minWidth: 600, idealWidth: 680, maxWidth: .infinity, minHeight: 560, idealHeight: 600, maxHeight: .infinity)
        .background(DS.Colors.background)
        .preferredColorScheme(.dark)
        .onDisappear {
            audioPlayer?.stop()
        }
    }

    private var windowHeader: some View {
        HStack(spacing: 10) {
            Image(systemName: "cursorarrow")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(DS.Colors.accent)

            Text("Skilly")
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundColor(DS.Colors.textPrimary)

            Text("PERMISSION-FREE PREVIEW")
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .tracking(0.7)
                .foregroundColor(DS.Colors.accentText)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(DS.Colors.accentSubtle)
                .clipShape(Capsule())

            Spacer()

            Label("No access yet", systemImage: "lock.fill")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(DS.Colors.textTertiary)

            Button {
                isMuted.toggle()
                if isMuted {
                    audioPlayer?.stop()
                }
            } label: {
                Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(DS.Colors.textSecondary)
                    .frame(width: 28, height: 28)
                    .background(DS.Colors.surfaceSecondary)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .pointerCursor()
            .accessibilityLabel(isMuted ? "Unmute sample" : "Mute sample")
        }
        .padding(.horizontal, 22)
        .frame(height: 50)
        .background(DS.Colors.surface1)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(DS.Colors.borderSubtle)
                .frame(height: 1)
        }
    }

    private var demoSurface: some View {
        VStack(spacing: 0) {
            HStack(spacing: 7) {
                Circle().fill(DS.Colors.textTertiary.opacity(0.5)).frame(width: 7, height: 7)
                Circle().fill(DS.Colors.textTertiary.opacity(0.35)).frame(width: 7, height: 7)
                Circle().fill(DS.Colors.textTertiary.opacity(0.25)).frame(width: 7, height: 7)
                Text("Blender · Sample Project")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(DS.Colors.textTertiary)
                    .padding(.leading, 4)
                Spacer()
                Text("SIMULATED SCREEN")
                    .font(.system(size: 8, weight: .bold, design: .rounded))
                    .tracking(0.6)
                    .foregroundColor(DS.Colors.textTertiary)
            }
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(DS.Colors.surface3)

            ZStack {
                HStack(spacing: 0) {
                    VStack(spacing: 8) {
                        demoToolIcon(systemName: "move.3d", label: "Move", highlighted: false)
                        demoToolIcon(systemName: "cube", label: "Object", highlighted: false)
                        demoToolIcon(
                            systemName: "square.stack.3d.up",
                            label: "Bevel",
                            highlighted: stage >= .pointing
                        )
                    }
                    .padding(.horizontal, 9)
                    .frame(maxHeight: .infinity)
                    .background(DS.Colors.surface2)

                    ZStack {
                        LinearGradient(
                            colors: [DS.Colors.surface1, DS.Colors.background],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )

                        Image(systemName: "cube.transparent")
                            .font(.system(size: 92, weight: .ultraLight))
                            .foregroundColor(DS.Colors.textSecondary)
                            .shadow(color: DS.Colors.accent.opacity(0.16), radius: 20)

                        VStack {
                            Spacer()
                            HStack {
                                Text("How do I add a bevel to this cube?")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(DS.Colors.textPrimary)
                                Spacer()
                                Image(systemName: "waveform")
                                    .foregroundColor(DS.Colors.accent)
                            }
                            .padding(.horizontal, 14)
                            .frame(height: 38)
                            .background(DS.Colors.surfaceSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous))
                            .padding(12)
                        }
                    }
                }

                GeometryReader { proxy in
                    if stage >= .pointing {
                        Image(systemName: "cursorarrow")
                            .font(.system(size: 25, weight: .bold))
                            .foregroundColor(DS.Colors.accent)
                            .shadow(color: Color.black.opacity(0.45), radius: 4, x: 0, y: 2)
                            .position(x: 84, y: proxy.size.height * 0.57)
                            .transition(.scale.combined(with: .opacity))
                    }
                }
                .allowsHitTesting(false)
            }
            .frame(height: 220)

            HStack(spacing: 10) {
                Circle()
                    .fill(stage >= .answering ? DS.Colors.accent : DS.Colors.textTertiary)
                    .frame(width: 8, height: 8)

                if stage >= .answering {
                    Text("Click the Bevel modifier — third tool on the left.")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(DS.Colors.textPrimary)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                } else if stage == .thinking || stage == .pointing {
                    Text("Skilly is finding the right control…")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(DS.Colors.textSecondary)
                } else {
                    Text("Play the sample to see screen-aware guidance.")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(DS.Colors.textSecondary)
                }

                Spacer()
            }
            .padding(.horizontal, 14)
            .frame(height: 42)
            .background(DS.Colors.surface2)
        }
        .clipShape(RoundedRectangle(cornerRadius: DS.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: DS.CornerRadius.large, style: .continuous)
                .stroke(DS.Colors.borderStrong, lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(0.24), radius: 18, x: 0, y: 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Permission-free simulated Blender lesson")
    }

    private var actionArea: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                if stage == .complete {
                    Button("Replay") {
                        audioPlayer?.stop()
                        stage = .ready
                    }
                    .dsSecondaryButtonStyle(isFullWidth: false)
                    .pointerCursor()
                }

                Button(primaryButtonTitle) {
                    if stage == .complete {
                        onContinue("demo")
                    } else {
                        runDemo()
                    }
                }
                .dsPrimaryButtonStyle()
                .frame(maxWidth: stage == .complete ? 330 : 360)
                .pointerCursor()
                .disabled(stage != .ready && stage != .complete)
            }

            HStack(spacing: 5) {
                Image(systemName: "lock.shield")
                Text("The preview uses only bundled sample content. No screen, microphone, or account data is accessed.")
            }
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(DS.Colors.textTertiary)

            Button("Continue directly to permission setup") {
                onContinue("skip")
            }
            .buttonStyle(.plain)
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(DS.Colors.textTertiary)
            .pointerCursor()
            .accessibilityHint("Skips the sample and shows the permissions Skilly needs")
        }
    }

    private var primaryButtonTitle: String {
        switch stage {
        case .ready:
            return "Play the sample"
        case .complete:
            return "Try Skilly on my screen"
        default:
            return "Finding the right control…"
        }
    }

    private func demoToolIcon(systemName: String, label: String, highlighted: Bool) -> some View {
        VStack(spacing: 3) {
            Image(systemName: systemName)
                .font(.system(size: 15, weight: .medium))
            Text(label)
                .font(.system(size: 8, weight: .semibold))
        }
        .foregroundColor(highlighted ? DS.Colors.textOnAccent : DS.Colors.textTertiary)
        .frame(width: 54, height: 48)
        .background(highlighted ? DS.Colors.accent : DS.Colors.surface1)
        .clipShape(RoundedRectangle(cornerRadius: DS.CornerRadius.medium, style: .continuous))
        .animation(.easeInOut(duration: 0.25), value: highlighted)
        .accessibilityLabel(label)
    }

    private func runDemo() {
        guard stage == .ready else { return }
        SkillyAnalytics.trackPermissionDemoStarted()
        stage = .thinking

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.78)) {
                stage = .pointing
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            withAnimation(.easeOut(duration: 0.35)) {
                stage = .answering
            }
            playAnswerAudio()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.3) {
            withAnimation(.easeOut(duration: 0.25)) {
                stage = .complete
            }
            SkillyAnalytics.trackPermissionDemoCompleted()
        }
    }

    private func playAnswerAudio() {
        guard !isMuted,
              let url = Bundle.main.url(forResource: "onboarding-demo-skilly", withExtension: "mp3") else {
            return
        }

        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.volume = 0.85
            player.prepareToPlay()
            player.play()
            audioPlayer = player
        } catch {
            #if DEBUG
            print("⚠️ Skilly: Could not play onboarding demo voice: \(error)")
            #endif
        }
    }
}

@MainActor
final class OnboardingDemoWindowController: NSObject, NSWindowDelegate {
    private let onContinue: (_ source: String) -> Void
    private var panel: NSPanel?

    var isVisible: Bool {
        panel?.isVisible == true
    }

    init(onContinue: @escaping (_ source: String) -> Void) {
        self.onContinue = onContinue
        super.init()
    }

    func show() {
        if panel == nil {
            createPanel()
        }

        positionOnActiveScreen()
        NSApp.activate(ignoringOtherApps: true)
        panel?.makeKeyAndOrderFront(nil)
        panel?.orderFrontRegardless()
    }

    func close() {
        panel?.orderOut(nil)
    }

    private func createPanel() {
        let view = OnboardingDemoView { [weak self] source in
            self?.onContinue(source)
        }
        let hostingView = NSHostingView(rootView: view)

        let onboardingPanel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 680, height: 600),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        onboardingPanel.delegate = self
        onboardingPanel.title = "Welcome to Skilly"
        onboardingPanel.titleVisibility = .hidden
        onboardingPanel.titlebarAppearsTransparent = true
        onboardingPanel.isMovableByWindowBackground = true
        onboardingPanel.isReleasedWhenClosed = false
        onboardingPanel.hidesOnDeactivate = false
        onboardingPanel.level = .floating
        onboardingPanel.collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary]
        onboardingPanel.backgroundColor = .clear
        onboardingPanel.isOpaque = false
        onboardingPanel.hasShadow = true
        onboardingPanel.minSize = NSSize(width: 600, height: 560)
        onboardingPanel.maxSize = NSSize(width: 760, height: 680)
        onboardingPanel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        onboardingPanel.standardWindowButton(.zoomButton)?.isHidden = true
        onboardingPanel.contentView = hostingView

        panel = onboardingPanel
    }

    private func positionOnActiveScreen() {
        guard let panel else { return }
        let mouseLocation = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouseLocation) } ?? NSScreen.main
        guard let visibleFrame = screen?.visibleFrame else {
            panel.center()
            return
        }

        let width = min(680, visibleFrame.width - 48)
        let height = min(600, visibleFrame.height - 48)
        panel.setFrame(
            NSRect(
                x: visibleFrame.midX - width / 2,
                y: visibleFrame.midY - height / 2,
                width: width,
                height: height
            ),
            display: true
        )
    }
}
