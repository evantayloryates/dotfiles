import AppKit
import Carbon

// A task-owned visual fixture. It receives real CUA input; it never synthesizes input.
final class FixtureView: NSView {
  var marker = 0
  override var isFlipped: Bool { true }
  override func draw(_ r: NSRect) {
    NSColor.white.setFill(); bounds.fill()
    let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 20), .foregroundColor: NSColor.black]
    "Recorder qualification — native AppKit".draw(at: NSPoint(x: 24, y: 22), withAttributes: attributes)
    "Right-click this panel for a native menu and submenu.".draw(at: NSPoint(x: 24, y: 175), withAttributes: attributes)
    "The magenta arrow below is drawn into app content.".draw(at: NSPoint(x: 24, y: 255), withAttributes: attributes)
    let colors = [NSColor(srgbRed: 0.9, green: 0.1, blue: 0.1, alpha: 1), NSColor(srgbRed: 0.1, green: 0.9, blue: 0.1, alpha: 1), NSColor(srgbRed: 0.1, green: 0.1, blue: 0.9, alpha: 1)]
    colors[marker].setFill(); NSRect(x: 24, y: 220, width: 100, height: 24).fill()
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
  var secureProbe: NSSecureTextField!
  var normalProbe: NSTextView!
  var ownsSecureInput = false
  let logQueue = DispatchQueue(label: "qualification-local-events")
  var actionOutput: FileHandle!
  var actionSequence = 0
  func logAction(_ kind: String, extra: [String: Any] = [:]) {
    actionSequence += 1
    var row = extra
    row["action"] = kind; row["sequence"] = actionSequence
    row["fixture_pid"] = getpid(); row["window_id"] = window.windowNumber
    row["host_ns"] = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
    row["frame_appkit"] = [window.frame.minX, window.frame.minY, window.frame.width, window.frame.height]
    var data = try! JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]); data.append(10)
    actionOutput.write(data)
  }
  func applicationDidFinishLaunching(_ notification: Notification) {
    let path = Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("native-delivered-\(getpid()).jsonl")
    _ = FileManager.default.createFile(atPath: path.path, contents: nil)
    let output = try! FileHandle(forWritingTo: path)
    let actionPath = path.deletingLastPathComponent().appendingPathComponent("native-actions-\(getpid()).jsonl")
    _ = FileManager.default.createFile(atPath: actionPath.path, contents: nil)
    actionOutput = try! FileHandle(forWritingTo: actionPath)
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
    normalProbe = text
    text.string = "Caret probe: click here, then type."
    text.font = NSFont.systemFont(ofSize: 24)
    scroll.documentView = text; scroll.borderType = .lineBorder
    view.addSubview(scroll)
    let secure=NSSecureTextField(frame:NSRect(x:24,y:150,width:250,height:24))
    secureProbe = secure
    secure.placeholderString="Synthetic secure input fixture"
    secure.setAccessibilityLabel("Secure input probe")
    view.addSubview(secure)
    let focusSecure=NSButton(title:"Focus secure input probe",target:self,action:#selector(focusSecureProbe))
    focusSecure.frame=NSRect(x:390,y:110,width:260,height:30);view.addSubview(focusSecure)
    let focusNormal=NSButton(title:"Focus normal input probe",target:self,action:#selector(focusNormalProbe))
    focusNormal.frame=NSRect(x:390,y:150,width:260,height:30);view.addSubview(focusNormal)
    let protect=NSButton(title:"Begin protected input canary",target:self,action:#selector(beginProtectedInput))
    protect.frame=NSRect(x:390,y:65,width:260,height:30);view.addSubview(protect)
    let release=NSButton(title:"End protected input canary",target:self,action:#selector(endProtectedInput))
    release.frame=NSRect(x:390,y:195,width:260,height:30);view.addSubview(release)
    let external=NSButton(title:"Move to external display",target:self,action:#selector(moveExternal))
    external.frame=NSRect(x:390,y:300,width:260,height:30);view.addSubview(external)
    let home=NSButton(title:"Return to built-in display",target:self,action:#selector(moveHome))
    home.frame=NSRect(x:390,y:265,width:260,height:30);view.addSubview(home)
    let move = NSButton(title: "Move 80 points", target: self, action: #selector(moveFixture))
    move.frame = NSRect(x: 160, y: 390, width: 180, height: 32); view.addSubview(move)
    let occlude = NSButton(title: "Toggle test occlusion", target: self, action: #selector(toggleCover))
    occlude.frame = NSRect(x: 355, y: 390, width: 220, height: 32); view.addSubview(occlude)
    let menu = NSButton(title: "Open edge menu", target: self, action: #selector(openEdgeMenu))
    menu.frame = NSRect(x: 520, y: 340, width: 155, height: 32); view.addSubview(menu)
    let marker = NSButton(title: "Advance timing marker", target: self, action: #selector(advanceMarker))
    marker.frame = NSRect(x: 155, y: 215, width: 230, height: 32); view.addSubview(marker)
    let resize = NSButton(title: "Resize 80 points", target: self, action: #selector(resizeFixture))
    resize.frame = NSRect(x: 155, y: 340, width: 230, height: 32); view.addSubview(resize)
    window.contentView = view
    window.makeKeyAndOrderFront(nil)
    NSApplication.shared.activate(ignoringOtherApps: true)
  }
  @objc func focusSecureProbe() {
    NSApp.activate(ignoringOtherApps:true)
    window.makeKeyAndOrderFront(nil)
    window.makeFirstResponder(secureProbe)
    logAction("focus_secure_probe")
  }
  @objc func focusNormalProbe() {
    NSApp.activate(ignoringOtherApps:true)
    window.makeKeyAndOrderFront(nil)
    window.makeFirstResponder(normalProbe)
    logAction("focus_normal_probe")
  }
  @objc func beginProtectedInput() {
    focusSecureProbe()
    if !ownsSecureInput { ownsSecureInput = EnableSecureEventInput() == noErr }
    logAction("protected_input_begin",extra:["owns_secure_input":ownsSecureInput,"secure_input_enabled":IsSecureEventInputEnabled()])
  }
  @objc func endProtectedInput() {
    if ownsSecureInput { _ = DisableSecureEventInput();ownsSecureInput=false }
    focusNormalProbe()
    logAction("protected_input_end",extra:["secure_input_enabled":IsSecureEventInputEnabled()])
  }
  func applicationWillTerminate(_ notification: Notification) {
    if ownsSecureInput { _ = DisableSecureEventInput();ownsSecureInput=false }
  }
  @objc func moveExternal() {
    guard let screen=NSScreen.screens.first(where:{ ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value != 1 }) else {
      logAction("external_display_unavailable");return
    }
    let frame=screen.visibleFrame
    window.setFrameOrigin(NSPoint(x:frame.minX+120,y:frame.minY+100))
    logAction("move_external",extra:["display_id":(screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0])
  }
  @objc func moveHome() {
    guard let screen=NSScreen.screens.first(where:{ ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == 1 }) else { return }
    window.setFrameOrigin(NSPoint(x:screen.frame.minX+120,y:screen.frame.minY+160))
    logAction("move_home",extra:["display_id":1])
  }
  @objc func advanceMarker() {
    guard let view = window.contentView as? FixtureView else { return }
    view.marker = (view.marker + 1) % 3
    logAction("marker", extra: ["marker": view.marker]); view.needsDisplay = true
  }
  @objc func moveFixture() { logAction("move"); window.setFrameOrigin(NSPoint(x: window.frame.minX + 80, y: window.frame.minY)) }
  @objc func resizeFixture() { logAction("resize"); window.setContentSize(NSSize(width: window.frame.width + 80, height: window.contentView!.frame.height + 40)) }
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
