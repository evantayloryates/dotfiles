import AppKit

// Native AppKit menus on a deliberately small parent. All production changes
// require delivered UI actions. No global input monitor or event synthesis.
enum FitLog {
  static let file: FileHandle = {
    let path = Bundle.main.bundleURL.deletingLastPathComponent()
      .appendingPathComponent("menu-fit-\(getpid()).jsonl")
    _ = FileManager.default.createFile(atPath: path.path, contents: nil,
      attributes: [.posixPermissions: 0o600])
    return try! FileHandle(forWritingTo: path)
  }()
  static func emit(_ kind: String, _ detail: [String: Any] = [:]) {
    var row = detail
    row["kind"] = kind
    row["host_ns"] = String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW))
    row["pid"] = getpid()
    row["qualification"] = "App-local lifecycle receipt; not physical presentation or actor authentication"
    var bytes = try! JSONSerialization.data(withJSONObject: row, options: [.sortedKeys])
    bytes.append(10)
    file.write(bytes)
  }
}

final class FitCanvas: NSView {
  override var isFlipped: Bool { true }
  var selections = 0
  override func draw(_ dirty: NSRect) {
    NSColor.white.setFill(); bounds.fill()
    for lane in 0..<3 {
      for row in 0..<6 {
        for column in 0..<6 {
          let seed = lane*97 + row*31 + column*17 + row*column*11
          let r = CGFloat((seed*37+53)%211+20)/255
          let g = CGFloat((seed*71+17)%211+20)/255
          let b = CGFloat((seed*19+109)%211+20)/255
          NSColor(srgbRed: r, green: g, blue: b, alpha: 1).setFill()
          NSRect(x: 20+lane*140+column*16, y: 70+row*16, width: 16, height: 16).fill()
        }
      }
    }
    ("Native menus • independent patches • selected \(selections)" as NSString)
      .draw(at: NSPoint(x: 20, y: 180), withAttributes:
        [.font: NSFont.systemFont(ofSize: 13), .foregroundColor: NSColor.black])
  }
}

final class FitDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  var window: NSWindow!
  let canvas = FitCanvas(frame: NSRect(x: 0, y: 0, width: 420, height: 208))
  var upper = false
  func frame() -> [String: CGFloat] {
    let r = window.frame, top = NSScreen.screens.first!.frame.maxY
    return ["x":r.minX,"y":top-r.maxY,"w":r.width,"h":r.height]
  }
  func applicationDidFinishLaunching(_ notification: Notification) {
    let top = NSScreen.screens.first!.frame.maxY
    window = NSWindow(contentRect: NSRect(x:400,y:top-840,width:420,height:208),
      styleMask:[.titled,.closable],backing:.buffered,defer:false)
    window.isReleasedWhenClosed = false
    window.title = "Owned native fit qualification87"
    window.contentView = canvas
    for (index, title, action) in [
      (0,"Open tall menu",#selector(tall)),
      (1,"Open short menu",#selector(short)),
      (2,"Move parent",#selector(move))] {
      let button = NSButton(title:title,target:self,action:action)
      button.frame = NSRect(x:20+index*130,y:12,width:120,height:32)
      canvas.addSubview(button)
    }
    let bar = NSMenu(), root = NSMenuItem(), appMenu = NSMenu()
    appMenu.addItem(withTitle:"Quit owned menu fit fixture",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
    root.submenu = appMenu; bar.addItem(root); NSApp.mainMenu = bar
    window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
    FitLog.emit("ready",["window_id":window.windowNumber,"frame":frame(),
      "patches_content":[[20,70,96,96],[160,70,96,96],[300,70,96,96]]])
  }
  func openMenu(_ count: Int) {
    let menu = NSMenu(title:count>3 ? "Owned tall native menu" : "Owned short native menu")
    menu.delegate = self; menu.autoenablesItems = false
    for index in 1...count {
      let title = "NATIVE \(index) • \(["Alpha","Birch","Cobalt","Delta"][index%4]) • fit reference"
      let item = NSMenuItem(title:title,action:#selector(selected(_:)),keyEquivalent:"")
      item.target = self; item.tag = index
      if index == 2 {
        let nested = NSMenu(title:"Owned nested native branch")
        nested.delegate = self; nested.autoenablesItems = false
        for n in 1...4 {
          let leaf = NSMenuItem(title:"BRANCH \(n) • independent native popup reference",action:#selector(selected(_:)),keyEquivalent:"")
          leaf.target = self; leaf.tag = 100+n; nested.addItem(leaf)
        }
        item.submenu = nested
      }
      menu.addItem(item)
    }
    FitLog.emit("menu_requested",["menu":menu.title,"items":count,"window_id":window.windowNumber,"frame":frame()])
    menu.popUp(positioning:nil,at:NSPoint(x:365,y:52),in:canvas)
  }
  @objc func tall() { openMenu(18) }
  @objc func short() { openMenu(3) }
  @objc func move() {
    upper.toggle()
    let top = NSScreen.screens.first!.frame.maxY, y:CGFloat = upper ? 260 : 600
    window.setFrameOrigin(NSPoint(x:400,y:top-y-window.frame.height))
    FitLog.emit("moved",["window_id":window.windowNumber,"frame":frame()])
  }
  @objc func selected(_ sender: NSMenuItem) {
    canvas.selections += 1; canvas.needsDisplay = true
    FitLog.emit("selected",["tag":sender.tag,"window_id":window.windowNumber])
  }
  func menuWillOpen(_ menu: NSMenu) { FitLog.emit("menu_open",["menu":menu.title]) }
  func menuDidClose(_ menu: NSMenu) { FitLog.emit("menu_closed",["menu":menu.title]) }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
  func applicationWillTerminate(_ notification: Notification) { FitLog.emit("terminated") }
}

let app = NSApplication.shared
let delegate = FitDelegate()
app.setActivationPolicy(.regular); app.delegate = delegate; app.run()
