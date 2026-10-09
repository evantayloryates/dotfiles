import AppKit

// Owned source-QA oracle. All changes require delivered UI actions; no input synthesis.
final class SentinelView: NSView {
  let child: Bool
  init(frame: NSRect, child: Bool) { self.child = child; super.init(frame: frame) }
  required init?(coder: NSCoder) { fatalError("not supported") }
  override var isFlipped: Bool { true }
  override func draw(_ dirty: NSRect) {
    NSColor.white.setFill(); bounds.fill()
    let color = child ? NSColor(srgbRed: 0, green: 1, blue: 0, alpha: 1) : NSColor(srgbRed: 1, green: 0, blue: 0, alpha: 1)
    color.setFill(); NSRect(x: 24, y: 80, width: 32, height: 32).fill()
    NSColor(srgbRed: 0, green: 0, blue: 1, alpha: 1).setFill()
    NSRect(x: bounds.width-56, y: bounds.height-56, width: 32, height: 32).fill()
    (child ? "Owned child" : "Dynamic transient geometry").draw(at: NSPoint(x: 24, y: 20),
      withAttributes: [.font: NSFont.systemFont(ofSize: 20), .foregroundColor: NSColor.black])
  }
}

final class TransientDelegate: NSObject, NSApplicationDelegate {
  var window: NSWindow!
  var popup: NSPanel?
  var log: FileHandle!
  var sequence = 0
  func globalFrame(_ window: NSWindow) -> [String: Double] {
    let top = NSScreen.screens.first!.frame.maxY
    let r = window.frame
    return ["x": r.minX, "y": top-r.maxY, "w": r.width, "h": r.height]
  }
  func emit(_ kind: String) {
    sequence += 1
    let row: [String: Any] = ["kind": kind, "sequence": sequence,
      "host_ns": String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)), "pid": getpid(),
      "window_id": window.windowNumber, "base": globalFrame(window),
      "child": popup.map(globalFrame) as Any? ?? NSNull(),
      "child_window_id": popup.map { $0.windowNumber } as Any? ?? NSNull(),
      "base_marker_content": [24, 80, 32, 32], "child_marker_content": [24, 80, 32, 32],
      "base_titlebar_points": window.frame.height-window.contentView!.bounds.height]
    var data = try! JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]); data.append(10)
    log.write(data)
  }
  func applicationDidFinishLaunching(_ notification: Notification) {
    let path = Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("transient-actions-\(getpid()).jsonl")
    FileManager.default.createFile(atPath: path.path, contents: nil)
    log = try! FileHandle(forWritingTo: path)
    let menu = NSMenu(); let item = NSMenuItem(); menu.addItem(item); item.submenu = NSMenu()
    item.submenu?.addItem(withTitle: "Quit owned fixture", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    NSApp.mainMenu = menu
    window = NSWindow(contentRect: NSRect(x: 120, y: 160, width: 600, height: 360),
      styleMask: [.titled, .closable], backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false; window.title = "Dynamic transient qualification"
    let content = SentinelView(frame: NSRect(x: 0, y: 0, width: 600, height: 360), child: false)
    let open = NSButton(title: "Open owned child", target: self, action: #selector(openChild))
    open.frame = NSRect(x: 100, y: 150, width: 220, height: 36); content.addSubview(open)
    let close = NSButton(title: "Close owned child", target: self, action: #selector(closeChild))
    close.frame = NSRect(x: 100, y: 200, width: 220, height: 36); content.addSubview(close)
    window.contentView = content; window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    emit("ready")
  }
  @objc func openChild() {
    guard popup == nil else { return }
    let p = NSPanel(contentRect: NSRect(x: window.frame.maxX+20, y: window.frame.minY+110, width: 180, height: 140),
      styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    p.isReleasedWhenClosed = false; p.title = "Owned overflow child"; p.hasShadow = false
    p.contentView = SentinelView(frame: NSRect(x: 0, y: 0, width: 180, height: 140), child: true)
    window.addChildWindow(p, ordered: .above); p.orderFront(nil); popup = p; emit("opened")
  }
  @objc func closeChild() {
    guard let p = popup else { return }; window.removeChildWindow(p); p.close(); popup = nil; emit("closed")
  }
  func applicationWillTerminate(_ notification: Notification) { emit("terminated") }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let application = NSApplication.shared
let delegate = TransientDelegate()
application.setActivationPolicy(.regular); application.delegate = delegate; application.run()
