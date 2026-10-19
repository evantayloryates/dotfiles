import AppKit

/// Authored native delivery oracle. No input synthesis, permissions or global
/// listener. Only this canvas's delivered pointer/wheel events are written.
final class GestureCanvas:NSView {
  override var isFlipped:Bool {true}
  var marker:NSPoint?,trace:[NSPoint]=[],scrollTotal:Double=0
  var counts:[String:Int]=[:]
  weak var summary:NSTextField?
  override func draw(_ dirtyRect:NSRect) {
    NSColor(srgbRed:0.15,green:0.15,blue:0.15,alpha:1).setFill();bounds.fill()
    NSColor(srgbRed:0.3,green:0.3,blue:0.3,alpha:1).setStroke()
    let grid=NSBezierPath();for x in stride(from:CGFloat(20),through:bounds.width,by:40){grid.move(to:NSPoint(x:x,y:0));grid.line(to:NSPoint(x:x,y:bounds.height))};for y in stride(from:CGFloat(20),through:bounds.height,by:40){grid.move(to:NSPoint(x:0,y:y));grid.line(to:NSPoint(x:bounds.width,y:y))};grid.stroke()
    if trace.count>1 {NSColor.white.setStroke();let line=NSBezierPath();line.lineWidth=2;line.move(to:trace[0]);for p in trace.dropFirst(){line.line(to:p)};line.stroke()}
    NSColor(srgbRed:0,green:1,blue:1,alpha:1).setFill()
    let band=20+CGFloat(abs(scrollTotal).truncatingRemainder(dividingBy:180));NSRect(x:bounds.width-22,y:band,width:12,height:16).fill()
    if let marker {NSColor(srgbRed:1,green:1,blue:0,alpha:1).setFill();NSRect(x:marker.x-5,y:marker.y-5,width:10,height:10).fill()}
  }
  func delivered(_ event:NSEvent,_ kind:String) {
    let local=convert(event.locationInWindow,from:nil)
    if kind != "wheel" {marker=local;if trace.count<2048{trace.append(local)}} else {scrollTotal+=event.scrollingDeltaY}
    counts[kind,default:0]+=1;needsDisplay=true
    summary?.stringValue="Down \(counts["down",default:0]) · Drag \(counts["drag",default:0]) · Up \(counts["up",default:0]) · Wheel \(counts["wheel",default:0])"
    guard let window,let main=NSScreen.screens.first else{return}
    let global=window.convertPoint(toScreen:event.locationInWindow)
    let cg=event.cgEvent
    func field(_ f:CGEventField)->Int64 {cg?.getIntegerValueField(f) ?? 0}
    var row:[String:Any]=["kind":kind,"received_host_ns":String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)),
      "event_timestamp_ns":String(cg?.timestamp ?? 0),"cg_type":cg?.type.rawValue as Any? ?? NSNull(),
      "cg_position":cg.map{[$0.location.x,$0.location.y]} ?? [],"local_top_left":[local.x,local.y],
      "expected_quartz":[global.x,main.frame.maxY-global.y],"window_number":window.windowNumber,
      "event_number":field(.mouseEventNumber),"destination_pid":field(.eventTargetUnixProcessID),"source_pid":field(.eventSourceUnixProcessID),
      "source_tag":String(field(.eventSourceUserData)),"button":field(.mouseEventButtonNumber),
      "window_quartz_frame":[window.frame.minX,main.frame.maxY-window.frame.maxY,window.frame.width,window.frame.height],
      "scale":window.backingScaleFactor,"scroll_total":scrollTotal,"ownership":"unknown; app delivery does not establish actor"]
    if kind=="wheel" {row["scroll"]=["cg_x":cg?.getDoubleValueField(.scrollWheelEventPointDeltaAxis2) ?? 0,
      "cg_y":cg?.getDoubleValueField(.scrollWheelEventPointDeltaAxis1) ?? 0,"cg_phase":field(.scrollWheelEventScrollPhase),
      "cg_momentum_phase":field(.scrollWheelEventMomentumPhase),"cg_continuous":field(.scrollWheelEventIsContinuous),
      "app_x":event.scrollingDeltaX,"app_y":event.scrollingDeltaY,"app_phase":event.phase.rawValue,"app_momentum_phase":event.momentumPhase.rawValue]}
    GestureDelegate.write(row)
  }
  override func mouseDown(with event:NSEvent){delivered(event,"down")}
  override func mouseDragged(with event:NSEvent){delivered(event,"drag")}
  override func mouseUp(with event:NSEvent){delivered(event,"up")}
  override func scrollWheel(with event:NSEvent){delivered(event,"wheel")}
}
final class GestureDelegate:NSObject,NSApplicationDelegate {
  var window:NSWindow!
  static let output:FileHandle = {
    let p=URL(fileURLWithPath:Bundle.main.bundlePath).deletingLastPathComponent().appendingPathComponent("delivered-\(getpid()).jsonl")
    FileManager.default.createFile(atPath:p.path,contents:nil,attributes:[.posixPermissions:0o600]);return try! FileHandle(forWritingTo:p)
  }()
  static func write(_ row:[String:Any]) {if var d=try? JSONSerialization.data(withJSONObject:row,options:[.sortedKeys]){d.append(10);output.write(d)}}
  func applicationDidFinishLaunching(_ n:Notification) {
    window=NSWindow(contentRect:NSRect(x:880,y:160,width:500,height:370),styleMask:[.titled,.closable],backing:.buffered,defer:false)
    window.isReleasedWhenClosed=false;window.title="Native gesture qualification";window.colorSpace = .sRGB
    let root=NSView(frame:NSRect(x:0,y:0,width:500,height:370));window.contentView=root
    let canvas=GestureCanvas(frame:NSRect(x:10,y:75,width:480,height:285));canvas.setAccessibilityElement(true);canvas.setAccessibilityRole(.image);canvas.setAccessibilityLabel("Gesture canvas");root.addSubview(canvas)
    let summary=NSTextField(labelWithString:"Down 0 · Drag 0 · Up 0 · Wheel 0");summary.frame=NSRect(x:10,y:43,width:480,height:24);root.addSubview(summary);canvas.summary=summary
    let focus=NSButton(title:"Focus fixture",target:self,action:#selector(focusFixture));focus.frame=NSRect(x:10,y:8,width:180,height:28);root.addSubview(focus)
    window.makeKeyAndOrderFront(nil)
    Self.write(["kind":"fixture_ready","pid":getpid(),"window_number":window.windowNumber,"host_ns":String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW))])
  }
  @objc func focusFixture(){window.collectionBehavior.insert(.moveToActiveSpace);NSApp.activate(ignoringOtherApps:true);window.makeKeyAndOrderFront(nil)}
  func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{true}
}
let app=NSApplication.shared,delegate=GestureDelegate();app.setActivationPolicy(.regular);app.delegate=delegate;app.run()
