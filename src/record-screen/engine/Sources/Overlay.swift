import AppKit

/// Frame outlines drawn around a target so you (and a screenshot from another
/// tool) can see where the engine will record. They never appear in the
/// engine's own captures: every capture filter excludes the engine's windows,
/// and the panels also opt out of screen sharing. They never take focus or
/// clicks.
@MainActor
final class Overlays {
  static let shared = Overlays()
  private var panels: [String: NSPanel] = [:]
  private var timers: [String: Timer] = [:]

  /// `frame` is in global top-left-origin points.
  func show(id: String, frame: CGRect, label: String?, seconds: Double, capturable: Bool = false) {
    hide(id: id)
    let pad: CGFloat = 6
    let outer = frame.insetBy(dx: -pad, dy: -pad)
    let mainHeight = NSScreen.screens.first?.frame.height ?? 0
    let cocoa = NSRect(x: outer.minX, y: mainHeight - outer.maxY, width: outer.width, height: outer.height)
    let panel = NSPanel(contentRect: cocoa, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
    panel.ignoresMouseEvents = true
    panel.level = .screenSaver
    // Hidden from every screen capture unless asked (to check how it looks).
    panel.sharingType = capturable ? .readOnly : .none
    panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
    panel.isReleasedWhenClosed = false
    panel.contentView = OutlineView(frame: NSRect(origin: .zero, size: cocoa.size), pad: pad, label: label)
    panel.orderFrontRegardless()
    panels[id] = panel
    if seconds > 0 {
      timers[id] = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
        MainActor.assumeIsolated { self?.hide(id: id) }
      }
    }
  }

  /// Hides one outline by id, every outline whose id starts with `prefix`
  /// (a session's), or all of them.
  func hide(id: String?, prefix: String? = nil) {
    let ids = id.map { [$0] } ?? Array(panels.keys).filter { prefix == nil || $0.hasPrefix(prefix!) }
    for i in ids {
      timers.removeValue(forKey: i)?.invalidate()
      panels.removeValue(forKey: i)?.orderOut(nil)
    }
  }

  var active: [String] { Array(panels.keys).sorted() }
}

private final class OutlineView: NSView {
  private let pad: CGFloat
  private let label: String?
  init(frame: NSRect, pad: CGFloat, label: String?) {
    self.pad = pad
    self.label = label
    super.init(frame: frame)
  }
  required init?(coder: NSCoder) { fatalError() }

  override func draw(_ dirtyRect: NSRect) {
    let red = NSColor(srgbRed: 0.84, green: 0.20, blue: 0.17, alpha: 1)
    let inner = bounds.insetBy(dx: pad - 3, dy: pad - 3)
    // Thin full outline plus heavier corner brackets, like a camera viewfinder.
    red.withAlphaComponent(0.55).setStroke()
    let outline = NSBezierPath(rect: inner)
    outline.lineWidth = 1.5
    outline.stroke()
    red.setStroke()
    let arm = min(28, inner.width / 4, inner.height / 4)
    let path = NSBezierPath()
    path.lineWidth = 4
    for (x, y, dx, dy) in [(inner.minX, inner.minY, 1.0, 1.0), (inner.maxX, inner.minY, -1.0, 1.0),
                           (inner.minX, inner.maxY, 1.0, -1.0), (inner.maxX, inner.maxY, -1.0, -1.0)] {
      path.move(to: NSPoint(x: x + dx * arm, y: y))
      path.line(to: NSPoint(x: x, y: y))
      path.line(to: NSPoint(x: x, y: y + dy * arm))
    }
    path.stroke()
    if let label, !label.isEmpty {
      let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 12, weight: .semibold), .foregroundColor: NSColor.white]
      let text = NSAttributedString(string: label, attributes: attrs)
      let size = text.size()
      let box = NSRect(x: inner.minX + 10, y: inner.maxY - size.height - 12, width: size.width + 12, height: size.height + 6)
      red.setFill()
      NSBezierPath(roundedRect: box, xRadius: 4, yRadius: 4).fill()
      text.draw(at: NSPoint(x: box.minX + 6, y: box.minY + 3))
    }
  }
}
