import AppKit

// A task-owned visual fixture. It receives real CUA input; it never synthesizes input.
final class FixtureView: NSView {
  override var isFlipped: Bool { true }
  override func draw(_ r: NSRect) {
    NSColor.white.setFill(); bounds.fill()
    let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 20), .foregroundColor: NSColor.black]
    "Recorder qualification — native AppKit".draw(at: NSPoint(x: 24, y: 22), withAttributes: attributes)
    "Right-click this panel for a native menu and submenu.".draw(at: NSPoint(x: 24, y: 175), withAttributes: attributes)
    "The magenta arrow below is drawn into app content.".draw(at: NSPoint(x: 24, y: 255), withAttributes: attributes)
    NSColor.systemPink.setFill()
    let arrow = NSBezierPath(); arrow.move(to: NSPoint(x: 55, y: 305)); arrow.line(to: NSPoint(x: 55, y: 365))
    arrow.line(to: NSPoint(x: 72, y: 350)); arrow.line(to: NSPoint(x: 95, y: 350)); arrow.close(); arrow.fill()
  }
  override func menu(for event: NSEvent) -> NSMenu? {
    makeMenu()
  }
  func makeMenu() -> NSMenu {
    let m = NSMenu(title: "Qualification menu")
    m.addItem(withTitle: "Native menu sentinel", action: nil, keyEquivalent: "")
    let nested = m.addItem(withTitle: "Nested menu", action: nil, keyEquivalent: "")
    let child = NSMenu(title: "Nested menu"); child.addItem(withTitle: "Submenu sentinel", action: nil, keyEquivalent: "")
    nested.submenu = child
    return m
  }
}
final class Delegate: NSObject, NSApplicationDelegate {
  var window: NSWindow!
  var monitor: Any?
  var cover: NSWindow?
  let logQueue = DispatchQueue(label: "qualification-local-events")
  func applicationDidFinishLaunching(_ notification: Notification) {
    let path = Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("native-delivered-\(getpid()).jsonl")
    _ = FileManager.default.createFile(atPath: path.path, contents: nil)
    let output = try! FileHandle(forWritingTo: path)
    monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp, .flagsChanged, .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp, .mouseMoved, .leftMouseDragged, .scrollWheel]) { [weak self] event in
      let row: [String: Any] = ["type": event.type.rawValue, "event_uptime_s": event.timestamp,
        "received_uptime_ns": clock_gettime_nsec_np(CLOCK_UPTIME_RAW), "key_code": event.keyCode,
        "modifiers": event.modifierFlags.rawValue, "window_number": event.windowNumber,
        "x": event.locationInWindow.x, "y": event.locationInWindow.y,
        "scope": "delivered to task-owned fixture", "origin": "unknown"]
      if var data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) {
        data.append(10)
        let encoded = data
        self?.logQueue.async { output.write(encoded) }
      }
      return event
    }
    let main = NSMenu(); let appItem = NSMenuItem(); main.addItem(appItem)
    appItem.submenu = NSMenu(); appItem.submenu?.addItem(withTitle: "Quit fixture", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    let edit = NSMenuItem(title: "Edit", action: nil, keyEquivalent: ""); main.addItem(edit)
    edit.submenu = NSMenu(title: "Edit")
    edit.submenu?.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    NSApplication.shared.mainMenu = main
    window = NSWindow(contentRect: NSRect(x: 120, y: 160, width: 700, height: 450), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    window.title = "Recorder qualification fixture"
    let view = FixtureView(frame: NSRect(x: 0, y: 0, width: 700, height: 450))
    let scroll = NSScrollView(frame: NSRect(x: 24, y: 66, width: 640, height: 80))
    let text = NSTextView(frame: scroll.bounds)
    text.string = "Caret probe: click here, then type."
    text.font = NSFont.systemFont(ofSize: 24)
    scroll.documentView = text; scroll.borderType = .lineBorder
    view.addSubview(scroll)
    let move = NSButton(title: "Move 80 points", target: self, action: #selector(moveFixture))
    move.frame = NSRect(x: 160, y: 390, width: 180, height: 32); view.addSubview(move)
    let occlude = NSButton(title: "Toggle test occlusion", target: self, action: #selector(toggleCover))
    occlude.frame = NSRect(x: 355, y: 390, width: 220, height: 32); view.addSubview(occlude)
    let menu = NSButton(title: "Open edge menu", target: self, action: #selector(openEdgeMenu))
    menu.frame = NSRect(x: 520, y: 340, width: 155, height: 32); view.addSubview(menu)
    window.contentView = view
    window.makeKeyAndOrderFront(nil)
    NSApplication.shared.activate(ignoringOtherApps: true)
  }
  @objc func moveFixture() { window.setFrameOrigin(NSPoint(x: window.frame.minX + 80, y: window.frame.minY)) }
  @objc func openEdgeMenu() {
    guard let view = window.contentView as? FixtureView else { return }
    view.makeMenu().popUp(positioning: nil, at: NSPoint(x: 650, y: 425), in: view)
  }
  @objc func toggleCover() {
    if let cover { cover.close(); self.cover = nil; return }
    let r = window.frame
    let c = NSWindow(contentRect: NSRect(x: r.minX + 160, y: r.minY + 170, width: 340, height: 110), styleMask: [.titled, .closable], backing: .buffered, defer: false)
    c.isReleasedWhenClosed = false
    c.title = "Task-owned occlusion sentinel"
    let label = NSTextField(labelWithString: "Display crop is now obstructed")
    label.frame = NSRect(x: 20, y: 35, width: 300, height: 40); c.contentView?.addSubview(label)
    c.makeKeyAndOrderFront(nil); cover = c
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let application = NSApplication.shared
let delegate = Delegate()
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()
