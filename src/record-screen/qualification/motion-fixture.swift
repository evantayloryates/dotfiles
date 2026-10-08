import AppKit

// Authored, bounded capture load. No synthesized input or network access.
final class MotionView: NSView {
  var tick: UInt64 = 0
  override var isFlipped: Bool { true }
  override func draw(_ dirty: NSRect) {
    NSColor.white.setFill(); bounds.fill()
    let area = NSRect(x:24,y:84,width:952,height:540)
    NSColor.black.setFill(); area.fill()
    for i in 0..<128 {
      let x = area.minX + CGFloat((Int(tick)*7+i*71)%900)
      let y = area.minY + 28 + CGFloat((Int(tick)*3+i*37)%460)
      NSColor(calibratedHue:CGFloat((Int(tick)+i*13)%360)/360,saturation:0.8,brightness:0.9,alpha:1).setFill()
      NSRect(x:x,y:y,width:52,height:42).fill()
    }
    // Twelve solid binary cells allow the decoded footage to corroborate
    // changing application pixels without OCR or a capture timestamp claim.
    for bit in 0..<12 {
      (tick & (1 << bit) == 0 ? NSColor.black : NSColor.white).setFill()
      NSRect(x:area.minX+CGFloat(bit*24),y:area.minY,width:20,height:20).fill()
    }
    let a:[NSAttributedString.Key:Any] = [.font:NSFont.monospacedSystemFont(ofSize:18,weight:.regular),.foregroundColor:NSColor.black]
    "Authored motion tick: \(tick) · nominal timer 60 Hz".draw(at:NSPoint(x:24,y:650),withAttributes:a)
  }
}
final class MotionDelegate: NSObject, NSApplicationDelegate {
  var window:NSWindow!
  var view:MotionView!
  var timer:Timer?
  var stopTimer:Timer?
  var output:FileHandle!
  var monitor:Any?
  func write(_ row:[String:Any]) {
    var r=row;r["host_ns"]=String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW));r["pid"]=getpid()
    guard var d=try? JSONSerialization.data(withJSONObject:r,options:[.sortedKeys]) else { return }
    d.append(10);output.write(d)
  }
  func applicationDidFinishLaunching(_ notification:Notification) {
    let path=Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("motion-delivered-\(getpid()).jsonl")
    _=FileManager.default.createFile(atPath:path.path,contents:nil);output=try! FileHandle(forWritingTo:path)
    let main=NSMenu();let item=NSMenuItem();main.addItem(item);item.submenu=NSMenu()
    item.submenu?.addItem(withTitle:"Quit motion fixture",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
    NSApp.mainMenu=main
    window=NSWindow(contentRect:NSRect(x:120,y:140,width:1000,height:700),styleMask:[.titled,.closable,.resizable],backing:.buffered,defer:false)
    window.title="Recorder qualification — bounded motion";window.isReleasedWhenClosed=false
    view=MotionView(frame:NSRect(x:0,y:0,width:1000,height:700));window.contentView=view
    let start=NSButton(title:"Start 60 Hz motion (120s maximum)",target:self,action:#selector(startMotion));start.frame=NSRect(x:24,y:25,width:330,height:32);view.addSubview(start)
    let stop=NSButton(title:"Stop motion",target:self,action:#selector(stopMotion));stop.frame=NSRect(x:370,y:25,width:160,height:32);view.addSubview(stop)
    monitor=NSEvent.addLocalMonitorForEvents(matching:[.leftMouseDown,.leftMouseUp,.rightMouseDown,.rightMouseUp,.leftMouseDragged,.mouseMoved,.scrollWheel]) { [weak self] e in
      guard let self else{return e};self.write(["kind":"delivered_pointer","type":e.type.rawValue,"event_uptime_s":e.timestamp,"x_window":e.locationInWindow.x,"y_window":e.locationInWindow.y,"window":e.windowNumber]);return e
    }
    window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
    write(["kind":"fixture_ready","window":window.windowNumber])
  }
  @objc func startMotion() {
    stopMotion();write(["kind":"motion_start","tick":view.tick])
    timer=Timer.scheduledTimer(withTimeInterval:1.0/60,repeats:true){[weak self] _ in guard let self else{return};self.view.tick+=1;self.view.needsDisplay=true}
    stopTimer=Timer.scheduledTimer(withTimeInterval:120,repeats:false){[weak self] _ in self?.stopMotion()}
  }
  @objc func stopMotion() {
    timer?.invalidate();stopTimer?.invalidate();timer=nil;stopTimer=nil
    if view != nil {write(["kind":"motion_stop","tick":view.tick])}
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{true}
  func applicationWillTerminate(_ notification:Notification){stopMotion()}
}
let app=NSApplication.shared;let delegate=MotionDelegate();app.setActivationPolicy(.regular);app.delegate=delegate;app.run()
