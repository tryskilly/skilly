import UIKit

/// Companion visual state — drives the launcher appearance.
enum SkillyState {
    case idle, listening, thinking, speaking
}

/// A container whose touches pass through to the host app EXCEPT on its own
/// interactive subviews (the launcher). The cursor + bubble are non-interactive,
/// so the host UI underneath stays fully usable.
final class PassthroughContainerView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        for subview in subviews.reversed() where subview.isUserInteractionEnabled && !subview.isHidden {
            let converted = convert(point, to: subview)
            if subview.point(inside: converted, with: event),
               let hit = subview.hitTest(converted, with: event) {
                return hit
            }
        }
        return nil // pass through to the host app
    }
}

/// The blue cursor (a simple pointer triangle), driven per-frame by the pointing
/// engine in Phase 9.2.
final class CursorView: UIView {
    private let accentColor: UIColor

    init(accentColor: UIColor) {
        self.accentColor = accentColor
        super.init(frame: CGRect(x: 0, y: 0, width: 24, height: 24))
        backgroundColor = .clear
        isUserInteractionEnabled = false
        isHidden = true
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.3
        layer.shadowRadius = 3
        layer.shadowOffset = CGSize(width: 0, height: 2)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func draw(_ rect: CGRect) {
        let path = UIBezierPath()
        path.move(to: CGPoint(x: rect.minX + 4, y: rect.minY + 2))
        path.addLine(to: CGPoint(x: rect.maxX - 4, y: rect.midY + 2))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.midY + 4))
        path.addLine(to: CGPoint(x: rect.midX - 2, y: rect.maxY - 4))
        path.close()
        accentColor.setFill()
        UIColor.white.setStroke()
        path.lineWidth = 1.5
        path.fill()
        path.stroke()
    }
}

/// A rounded response bubble with internal padding.
final class BubbleLabel: UILabel {
    private let insets = UIEdgeInsets(top: 12, left: 14, bottom: 12, right: 14)

    override init(frame: CGRect) {
        super.init(frame: frame)
        numberOfLines = 0
        textColor = UIColor(white: 0.95, alpha: 1)
        font = .systemFont(ofSize: 14)
        backgroundColor = UIColor(white: 0.11, alpha: 1)
        layer.cornerRadius = 16
        layer.masksToBounds = true
        isUserInteractionEnabled = false
        isHidden = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func drawText(in rect: CGRect) {
        super.drawText(in: rect.inset(by: insets))
    }

    override var intrinsicContentSize: CGSize {
        let base = super.intrinsicContentSize
        return CGSize(width: base.width + insets.left + insets.right,
                      height: base.height + insets.top + insets.bottom)
    }
}

/// Owns the passthrough overlay window and its launcher / bubble / cursor. The iOS
/// analog of the web widget's Shadow-DOM host.
@MainActor
final class SkillyOverlay {
    private var window: UIWindow?
    private let container = PassthroughContainerView()
    private let launcher = UIButton(type: .custom)
    private let bubble = BubbleLabel()
    private let cursor: CursorView
    private let accentColor: UIColor

    /// Fired when the user taps the launcher.
    var onLauncherTapped: (() -> Void)?

    init(accentColor: UIColor) {
        self.accentColor = accentColor
        self.cursor = CursorView(accentColor: accentColor)
    }

    /// Create the overlay window above the host app and lay out the controls.
    func mount() {
        guard let scene = Self.activeWindowScene() else { return }
        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1
        window.backgroundColor = .clear
        window.isUserInteractionEnabled = true

        let rootController = UIViewController()
        rootController.view = container
        container.backgroundColor = .clear
        window.rootViewController = rootController
        window.isHidden = false
        self.window = window

        configureLauncher()
        container.addSubview(bubble)
        container.addSubview(cursor)
        container.addSubview(launcher)
        layoutControls()
    }

    private func configureLauncher() {
        launcher.backgroundColor = accentColor
        launcher.tintColor = .white
        launcher.setImage(UIImage(systemName: "mic.fill"), for: .normal)
        launcher.layer.cornerRadius = 28
        launcher.layer.shadowColor = UIColor.black.cgColor
        launcher.layer.shadowOpacity = 0.25
        launcher.layer.shadowRadius = 10
        launcher.layer.shadowOffset = CGSize(width: 0, height: 6)
        launcher.addTarget(self, action: #selector(handleLauncherTap), for: .touchUpInside)
    }

    @objc private func handleLauncherTap() {
        onLauncherTapped?()
    }

    /// Position the launcher (bottom-right) and the bubble (above it).
    private func layoutControls() {
        guard let bounds = window?.bounds else { return }
        let safe = window?.safeAreaInsets ?? .zero
        let size: CGFloat = 56
        let margin: CGFloat = 20
        launcher.frame = CGRect(
            x: bounds.maxX - size - margin - safe.right,
            y: bounds.maxY - size - margin - safe.bottom,
            width: size, height: size
        )

        let bubbleWidth = min(320, bounds.width - 2 * margin)
        bubble.preferredMaxLayoutWidth = bubbleWidth - 28
        let bubbleSize = bubble.intrinsicContentSize
        bubble.frame = CGRect(
            x: launcher.frame.maxX - bubbleSize.width,
            y: launcher.frame.minY - bubbleSize.height - 12,
            width: bubbleSize.width, height: bubbleSize.height
        )
    }

    func setState(_ state: SkillyState) {
        // 9.1: state is reflected via the launcher's alpha pulse hook (full
        // listening animation lands with the voice pipeline in 9.3).
        launcher.alpha = (state == .idle) ? 1.0 : 0.92
    }

    func setBubble(_ text: String) {
        bubble.text = text
        bubble.isHidden = text.isEmpty
        layoutControls()
    }

    func showCursor() { cursor.isHidden = false }
    func hideCursor() { cursor.isHidden = true }

    /// Set the cursor's position in window coordinates (offset so the tip lands on
    /// the target). The Phase 9.2 pointing engine drives this per frame.
    func setCursorPosition(_ point: CGPoint) {
        cursor.center = CGPoint(x: point.x + 8, y: point.y + 8)
    }

    func teardown() {
        window?.isHidden = true
        window = nil
    }

    /// The host app's active foreground window scene to attach the overlay to.
    private static func activeWindowScene() -> UIWindowScene? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    }
}
