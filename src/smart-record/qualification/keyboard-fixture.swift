import AppKit

// Authored app-delivery oracle. No global tap, input synthesis or characters.
// Native UI drives the two windows; CG timestamps remain raw observations.
final class KeyboardApplication: NSApplication {
  override func sendEvent(_ event: NSEvent) {
    if [.keyDown, .keyUp, .flagsChanged].contains(event.type) {
      KeyboardDelegate.record(event, kind: "key_delivery", window: event.window ?? keyWindow)
    }
    super.sendEvent(event)
  }
}

final class KeyboardCanvas: NSView {
  override var acceptsFirstResponder: Bool { true }
  override func keyDown(with event: NSEvent) { needsDisplay = true }
  override func keyUp(with event: NSEvent) { }
  override func flagsChanged(with event: NSEvent) { }
  override func draw(_ dirtyRect: NSRect) {
    NSColor(srgbRed: 0.12, green: 0.16, blue: 0.20, alpha: 1).setFill()
    bounds.fill()
  }
}

final class KeyboardDelegate: NSObject, NSApplicationDelegate {
  var windows: [NSWindow] = []
  var canvases: [KeyboardCanvas] = []
  var summaries: [NSTextField] = []
  var shortcuts: [Int: Int] = [:]
  static let output: FileHandle = {
    let url = URL(fileURLWithPath: Bundle.main.bundlePath).deletingLastPathComponent()
      .appendingPathComponent("keyboard-delivered-\(getpid()).jsonl")
    FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.posixPermissions: 0o600])
    return try! FileHandle(forWritingTo: url)
  }()
  static func write(_ row: [String: Any]) {
    if var bytes = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) {
      bytes.append(10); output.write(bytes)
    }
  }
  static func record(_ event: NSEvent, kind: String, window: NSWindow?) {
    let cg = event.cgEvent
    var row: [String: Any] = ["kind": kind,
      "received_host_ns": String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)),
      "event_timestamp_ns": String(cg?.timestamp ?? 0), "key_code": event.keyCode,
      "flags": String(cg?.flags.rawValue ?? UInt64(event.modifierFlags.rawValue)),
      "ownership": "unknown; delivered app handling does not authenticate actor"]
    row["cg_type"] = cg?.type.rawValue as Any? ?? NSNull()
    row["window_number"] = window?.windowNumber as Any? ?? NSNull()
    row["key_window_number"] = NSApp.keyWindow?.windowNumber as Any? ?? NSNull()
    row["destination_pid"] = cg?.getIntegerValueField(.eventTargetUnixProcessID) as Any? ?? NSNull()
    row["source_pid"] = cg?.getIntegerValueField(.eventSourceUnixProcessID) as Any? ?? NSNull()
    write(row)
  }
  func applicationDidFinishLaunching(_ note: Notification) {
    let menu = NSMenu(); let root = NSMenuItem(); menu.addItem(root)
    let commands = NSMenu(title: "Keyboard qualification"); root.submenu = commands
    let shortcut = NSMenuItem(title: "Count shortcut", action: #selector(countShortcut), keyEquivalent: "k")
    shortcut.keyEquivalentModifierMask = [.command, .shift]; shortcut.target = self
    commands.addItem(shortcut); NSApp.mainMenu = menu
    for index in 0...1 {
      let window = NSWindow(contentRect: NSRect(x: 80 + index * 560, y: 210, width: 500, height: 280),
        styleMask: [.titled, .closable], backing: .buffered, defer: false)
      window.isReleasedWhenClosed = false; window.title = "Keyboard scope \(index == 0 ? "A" : "B")"
      window.colorSpace = .sRGB
      let root = NSView(frame: NSRect(x: 0, y: 0, width: 500, height: 280)); window.contentView = root
      let canvas = KeyboardCanvas(frame: NSRect(x: 10, y: 100, width: 480, height: 170))
      canvas.setAccessibilityElement(true); canvas.setAccessibilityRole(.image)
      canvas.setAccessibilityLabel("Keyboard sink; no text field"); root.addSubview(canvas)
      let summary = NSTextField(labelWithString: "Shortcut count 0; scope \(index == 0 ? "A" : "B")")
      summary.frame = NSRect(x: 10, y: 65, width: 480, height: 26); root.addSubview(summary)
      for buttonIndex in 0...1 {
        let button = NSButton(title: "Focus scope \(buttonIndex == 0 ? "A" : "B")", target: self, action: #selector(focusScope))
        button.tag = buttonIndex; button.frame = NSRect(x: 10 + buttonIndex * 210, y: 15, width: 200, height: 32)
        root.addSubview(button)
      }
      windows.append(window); canvases.append(canvas); summaries.append(summary)
      window.orderFront(nil)
      Self.write(["kind": "window_ready", "pid": getpid(), "window_number": window.windowNumber,
        "scope": index == 0 ? "A" : "B", "host_ns": String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW))])
    }
    focus(0)
  }
  func focus(_ index: Int) {
    windows[index].collectionBehavior.insert(.moveToActiveSpace)
    NSApp.activate(ignoringOtherApps: true); windows[index].makeKeyAndOrderFront(nil)
    windows[index].makeFirstResponder(canvases[index])
  }
  @objc func focusScope(_ sender: NSButton) { focus(sender.tag) }
  @objc func countShortcut() {
    guard let window = NSApp.keyWindow, let index = windows.firstIndex(of: window) else { return }
    shortcuts[index, default: 0] += 1
    summaries[index].stringValue = "Shortcut count \(shortcuts[index]!); scope \(index == 0 ? "A" : "B")"
    if let event = NSApp.currentEvent { Self.record(event, kind: "shortcut_executed", window: window) }
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let app = KeyboardApplication.shared, delegate = KeyboardDelegate()
app.setActivationPolicy(.regular); app.delegate = delegate; app.run()
