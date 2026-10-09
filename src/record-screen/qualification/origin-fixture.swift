import AppKit

// Independent geometry oracle, not a recorder mapping source or input generator.
// One delivered Start action runs a bounded five-direction child cycle.
final class OriginMarkerView: NSView {
  let child: Bool
  var tick = 0
  init(frame: NSRect, child: Bool) { self.child = child; super.init(frame: frame) }
  required init?(coder: NSCoder) { fatalError("not supported") }
  override var isFlipped: Bool { true }
  override func draw(_ dirty: NSRect) {
    NSColor.white.setFill(); bounds.fill()
    (child ? NSColor.green : NSColor.red).setFill()
    NSRect(x:24,y:80,width:32,height:32).fill()
    NSColor.blue.setFill(); NSRect(x:bounds.width-56,y:bounds.height-56,width:32,height:32).fill()
    NSColor.black.setFill()
    NSRect(x:CGFloat(20 + tick % 100),y:45,width:12,height:12).fill()
  }
}
final class OriginDelegate: NSObject, NSApplicationDelegate {
  var window: NSWindow!
  var child: NSPanel?
  var view: OriginMarkerView!
  var output: FileHandle!
  var timer: Timer?
  var startNS: UInt64?
  var lastPhase = -1
  var tick = 0
  let phases = ["baseline", "right", "left", "above", "below", "corner", "restored"]
  func frame(_ w: NSWindow) -> [String:Double] {
    let top = NSScreen.screens.first!.frame.maxY, r=w.frame
    return ["x":r.minX,"y":top-r.maxY,"w":r.width,"h":r.height]
  }
  func emit(_ kind: String, phase: String) {
    let row:[String:Any] = ["kind":kind,"phase":phase,"clock_domain":"CLOCK_UPTIME_RAW","host_ns":String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)),
      "pid":getpid(),"window_id":window.windowNumber,"base":frame(window),
      "child":child.map(frame) as Any? ?? NSNull(),"child_window_id":child.map{$0.windowNumber} as Any? ?? NSNull(),
      "base_titlebar_points":window.frame.height-window.contentView!.bounds.height,
      "base_marker_content":[24,80,32,32],"child_marker_content":[24,80,32,32],"tick":tick]
    var data=try! JSONSerialization.data(withJSONObject:row,options:[.sortedKeys]);data.append(10);output.write(data)
  }
  func applicationDidFinishLaunching(_ notification: Notification) {
    let path=Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("origin-oracle-\(getpid()).jsonl")
    _=FileManager.default.createFile(atPath:path.path,contents:nil);output=try! FileHandle(forWritingTo:path)
    let menu=NSMenu();let item=NSMenuItem();menu.addItem(item);item.submenu=NSMenu()
    item.submenu?.addItem(withTitle:"Quit owned origin fixture",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q");NSApp.mainMenu=menu
    let top=NSScreen.screens.first!.frame.maxY
    window=NSWindow(contentRect:NSRect(x:400,y:top-600,width:400,height:278),styleMask:[.titled,.closable],backing:.buffered,defer:false)
    window.isReleasedWhenClosed=false;window.hasShadow=false;window.title="Owned child-origin qualification"
    view=OriginMarkerView(frame:NSRect(x:0,y:0,width:400,height:278),child:false);window.contentView=view
    let button=NSButton(title:"Start 28 second origin cycle",target:self,action:#selector(startCycle))
    button.frame=NSRect(x:20,y:150,width:260,height:32);view.addSubview(button)
    window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true);emit("ready",phase:"baseline")
  }
  func setPhase(_ index:Int) {
    if let c=child { window.removeChildWindow(c);c.close();child=nil }
    if index>0 && index<6 {
      let r=window.frame
      let positions:[NSPoint] = [NSPoint(x:r.maxX+20,y:r.minY+80),NSPoint(x:r.minX-200,y:r.minY+80),
        NSPoint(x:r.minX+90,y:r.maxY+20),NSPoint(x:r.minX+90,y:r.minY-160),NSPoint(x:r.minX-100,y:r.maxY+20)]
      let c=NSPanel(contentRect:NSRect(origin:positions[index-1],size:NSSize(width:180,height:140)),styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false)
      c.isReleasedWhenClosed=false;c.hasShadow=false;c.title="Owned child \(phases[index])"
      c.contentView=OriginMarkerView(frame:NSRect(x:0,y:0,width:180,height:140),child:true)
      window.addChildWindow(c,ordered:.above);c.orderFront(nil);child=c
    }
    lastPhase=index;emit("phase",phase:phases[index])
  }
  @objc func startCycle() {
    guard startNS == nil else { return }
    startNS=clock_gettime_nsec_np(CLOCK_UPTIME_RAW);setPhase(0)
    timer=Timer.scheduledTimer(withTimeInterval:1.0/30.0,repeats:true){[weak self] _ in
      guard let self,let start=self.startNS else { return }
      let elapsed=Double(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)-start)/1e9
      if elapsed>=28 { self.timer?.invalidate();self.timer=nil;self.emit("finished",phase:"restored");return }
      let phase=min(6,Int(elapsed/4))
      if phase != self.lastPhase { self.setPhase(phase) }
      self.tick+=1;self.view.tick=self.tick;self.view.needsDisplay=true
      if let v=self.child?.contentView as? OriginMarkerView { v.tick=self.tick;v.needsDisplay=true }
    }
  }
  func applicationWillTerminate(_ notification:Notification) { timer?.invalidate();emit("terminated",phase:phases[max(0,lastPhase)]) }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool { true }
}
let app=NSApplication.shared,delegate=OriginDelegate()
app.setActivationPolicy(.regular);app.delegate=delegate;app.run()
