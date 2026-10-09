import AppKit

/// App-local delivery and transient-surface oracle. No global monitors, input
/// synthesis, permissions, literal typed text or authenticated actor inference.
enum InteractionLog {
  static let output: FileHandle = {
    let path = URL(fileURLWithPath: Bundle.main.bundlePath).deletingLastPathComponent()
      .appendingPathComponent("interaction-\(getpid()).jsonl")
    FileManager.default.createFile(atPath: path.path, contents: nil, attributes: [.posixPermissions: 0o600])
    return try! FileHandle(forWritingTo: path)
  }()
  static func write(_ data: [String: Any]) {
    var row = data; row["received_host_ns"] = String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW))
    row["ownership"] = "unknown; app-local delivery does not identify actor"
    if var bytes = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) {
      bytes.append(10); output.write(bytes)
    }
  }
}

final class InteractionCanvas: NSView {
  override var isFlipped: Bool { true }
  override var acceptsFirstResponder: Bool { true }
  var changed = false, count = 0, pointer: NSPoint?
  var lane = "target"
  override func updateTrackingAreas() {
    for area in trackingAreas { removeTrackingArea(area) }
    addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseMoved, .activeAlways, .inVisibleRect], owner: self))
    super.updateTrackingAreas()
  }
  override func draw(_ dirtyRect: NSRect) {
    NSColor.white.setFill(); bounds.fill()
    NSColor.red.setFill(); NSRect(x: 30, y: 80, width: 24, height: 24).fill()
    (changed ? NSColor.magenta : NSColor.green).setFill(); NSRect(x: 70, y: 80, width: 24, height: 24).fill()
    let text = "\(lane): delivered \(count). Canvas receives keys without a text field."
    (text as NSString).draw(at: NSPoint(x: 20, y: 135), withAttributes: [.font: NSFont.systemFont(ofSize: 15), .foregroundColor: NSColor.black])
    if let pointer { NSColor.blue.setFill(); NSRect(x: pointer.x-4, y: pointer.y-4, width: 8, height: 8).fill() }
  }
  func delivered(_ event: NSEvent, kind: String) {
    count += 1
    let local = convert(event.locationInWindow, from: nil)
    if kind.contains("mouse") || kind == "drag" { pointer = local }
    let cg = event.cgEvent
    var row: [String: Any] = ["kind": kind, "lane": lane, "window_id": window?.windowNumber ?? 0,
      "event_timestamp_ns": String(cg?.timestamp ?? 0), "cg_type": cg?.type.rawValue as Any? ?? NSNull(),
      "cg_position": cg.map { [$0.location.x, $0.location.y] } ?? [],
      "local_top_left": [local.x, local.y], "key_code": event.type == .keyDown || event.type == .keyUp || event.type == .flagsChanged ? event.keyCode as Any : NSNull(),
      "modifier_flags": event.modifierFlags.rawValue, "count": count]
    if event.type == .scrollWheel { row["scroll"] = ["x": event.scrollingDeltaX, "y": event.scrollingDeltaY,
      "phase": event.phase.rawValue, "momentum": event.momentumPhase.rawValue, "precise": event.hasPreciseScrollingDeltas] }
    InteractionLog.write(row); needsDisplay = true
  }
  override func keyDown(with event: NSEvent) { changed.toggle(); delivered(event, kind: "key_down") }
  override func keyUp(with event: NSEvent) { delivered(event, kind: "key_up") }
  override func flagsChanged(with event: NSEvent) { delivered(event, kind: "flags") }
  override func mouseDown(with event: NSEvent) { window?.makeFirstResponder(self); delivered(event, kind: "mouse_down") }
  override func mouseUp(with event: NSEvent) { delivered(event, kind: "mouse_up") }
  override func mouseMoved(with event: NSEvent) { delivered(event, kind: "mouse_move") }
  override func mouseDragged(with event: NSEvent) { delivered(event, kind: "drag") }
  override func scrollWheel(with event: NSEvent) { changed.toggle(); delivered(event, kind: "wheel") }
}

final class InteractionDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  var target: NSWindow!, companion: NSWindow!, targetCanvas = InteractionCanvas(frame: .zero), otherCanvas = InteractionCanvas(frame: .zero)
  func window(_ title: String, x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, canvas: InteractionCanvas) -> NSWindow {
    let result = NSWindow(contentRect: NSRect(x: x, y: y, width: width, height: height),
      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    result.isReleasedWhenClosed = false; result.title = title; result.acceptsMouseMovedEvents = true
    canvas.frame = NSRect(x: 0, y: 0, width: width, height: height); canvas.autoresizingMask = [.width, .height]
    result.contentView = canvas
    let focus = NSButton(title: "Focus \(canvas.lane) canvas", target: self, action: #selector(focusCanvas(_:)))
    focus.identifier = NSUserInterfaceItemIdentifier(canvas.lane); focus.frame = NSRect(x: 20, y: 20, width: 210, height: 35); canvas.addSubview(focus)
    if canvas.lane == "target" {
      let menu = NSButton(title: "Open native edge menu", target: self, action: #selector(openMenu(_:)))
      menu.frame = NSRect(x: width-250, y: 20, width: 230, height: 35); menu.autoresizingMask = [.minXMargin]; canvas.addSubview(menu)
      let switcher = NSButton(title: "Focus companion window", target: self, action: #selector(focusCompanion))
      switcher.frame = NSRect(x: 20, y: 190, width: 220, height: 35); canvas.addSubview(switcher)
    } else {
      let back = NSButton(title: "Focus target window", target: self, action: #selector(focusTarget))
      back.frame = NSRect(x: 20, y: 190, width: 220, height: 35); canvas.addSubview(back)
    }
    result.orderFront(nil); return result
  }
  func applicationDidFinishLaunching(_ notification: Notification) {
    otherCanvas.lane = "companion"
    target = window("Owned target interaction72", x: 120, y: 230, width: 620, height: 510, canvas: targetCanvas)
    companion = window("Owned companion interaction72", x: 970, y: 390, width: 350, height: 270, canvas: otherCanvas)
    focusTarget(); NSApp.activate(ignoringOtherApps: true)
    let appMenu = NSMenu(), bar = NSMenu(); let root = NSMenuItem(); root.submenu = appMenu; bar.addItem(root)
    appMenu.addItem(withTitle: "Quit owned interaction fixture", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    NSApp.mainMenu = bar
    InteractionLog.write(["kind": "ready", "target_window_id": target.windowNumber, "companion_window_id": companion.windowNumber])
  }
  @objc func focusCanvas(_ sender: NSButton) {
    if sender.identifier?.rawValue == "target" { focusTarget() } else { focusCompanion() }
  }
  @objc func focusTarget() { target.makeKeyAndOrderFront(nil); target.makeFirstResponder(targetCanvas); InteractionLog.write(["kind": "focus_target", "window_id": target.windowNumber]) }
  @objc func focusCompanion() { companion.makeKeyAndOrderFront(nil); companion.makeFirstResponder(otherCanvas); InteractionLog.write(["kind": "focus_companion", "window_id": companion.windowNumber]) }
  @objc func openMenu(_ sender: NSButton) {
    let menu = NSMenu(title: "Owned edge root"); menu.delegate = self
    let nested = NSMenuItem(title: "Open wide nested sentinel", action: nil, keyEquivalent: "")
    let child = NSMenu(title: "Owned nested sentinel"); child.delegate = self
    for index in 1...12 { let item = NSMenuItem(title: "NESTED SENTINEL \(index) — wide native overflow reference", action: #selector(selectSentinel(_:)), keyEquivalent: ""); item.target = self; item.tag = index; child.addItem(item) }
    nested.submenu = child; menu.addItem(nested)
    let plain = NSMenuItem(title: "ROOT SENTINEL — native menu", action: #selector(selectSentinel(_:)), keyEquivalent: ""); plain.target = self; menu.addItem(plain)
    InteractionLog.write(["kind": "menu_requested", "window_id": target.windowNumber])
    menu.popUp(positioning: nil, at: NSPoint(x: sender.frame.minX, y: sender.frame.maxY+5), in: targetCanvas)
  }
  func menuWillOpen(_ menu: NSMenu) { InteractionLog.write(["kind": "menu_open", "menu": menu.title]) }
  func menuDidClose(_ menu: NSMenu) { InteractionLog.write(["kind": "menu_closed", "menu": menu.title]) }
  @objc func selectSentinel(_ sender: NSMenuItem) { targetCanvas.changed.toggle(); targetCanvas.needsDisplay = true; InteractionLog.write(["kind": "selection", "sentinel": sender.tag]) }
  func applicationWillTerminate(_ notification: Notification) { InteractionLog.write(["kind": "terminated"]) }
}

let app = NSApplication.shared
let delegate = InteractionDelegate()
app.setActivationPolicy(.regular); app.delegate = delegate; app.run()
