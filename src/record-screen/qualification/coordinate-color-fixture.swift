import AppKit

/// Authored sRGB references and app-delivered coordinates. Never posts input.
final class CoordinateColorView: NSView {
  override var isFlipped: Bool { true }
  var marker: NSPoint?
  let references: [(String, [CGFloat])] = [
    ("red", [1,0,0]), ("green", [0,1,0]), ("blue", [0,0,1]),
    ("gray", [0.5,0.5,0.5]), ("white", [1,1,1]), ("black", [0,0,0])]
  override func draw(_ dirtyRect: NSRect) {
    NSColor(srgbRed:0.2,green:0.2,blue:0.2,alpha:1).setFill(); bounds.fill()
    for (index, ref) in references.enumerated() {
      let x = CGFloat(20 + index % 3 * 140), y = CGFloat(20 + index / 3 * 85)
      NSColor(srgbRed:ref.1[0],green:ref.1[1],blue:ref.1[2],alpha:1).setFill()
      NSRect(x:x,y:y,width:120,height:65).fill()
    }
    if let marker {
      NSColor(srgbRed:1,green:1,blue:0,alpha:1).setFill()
      NSRect(x:marker.x-5,y:marker.y-5,width:10,height:10).fill()
    }
  }
  override func mouseDown(with event: NSEvent) {
    marker = convert(event.locationInWindow, from:nil); needsDisplay = true
    guard let window, let main=NSScreen.screens.first else { return }
    let point=window.convertPoint(toScreen:event.locationInWindow)
    let quartz=NSPoint(x:point.x,y:main.frame.maxY-point.y)
    let raw=event.cgEvent?.location
    let row:[String:Any] = ["kind":"delivered_click","host_ns":String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)),
      "event_timestamp_ns":String(event.cgEvent?.timestamp ?? 0),"event_number":event.eventNumber,
      "window_number":window.windowNumber,"local_top_left":[marker!.x,marker!.y],
      "expected_quartz":[quartz.x,quartz.y],"cg_position":raw.map{[$0.x,$0.y]} ?? [],
      "window_quartz_frame":[window.frame.minX,main.frame.maxY-window.frame.maxY,window.frame.width,window.frame.height],
      "scale":window.backingScaleFactor,"origin":"unknown; native CUA delivery canary"]
    if var data=try? JSONSerialization.data(withJSONObject:row,options:[.sortedKeys]) { data.append(10); CoordinateColorDelegate.output.write(data) }
  }
}

final class CoordinateColorDelegate: NSObject, NSApplicationDelegate {
  var window:NSWindow!
  static let output:FileHandle = {
    let path=URL(fileURLWithPath:Bundle.main.bundlePath).deletingLastPathComponent().appendingPathComponent("coordinate-delivered-\(getpid()).jsonl").path
    FileManager.default.createFile(atPath:path,contents:nil,attributes:[.posixPermissions:0o600])
    return try! FileHandle(forWritingTo:URL(fileURLWithPath:path))
  }()
  func applicationDidFinishLaunching(_ notification:Notification) {
    window=NSWindow(contentRect:NSRect(x:900,y:120,width:440,height:280),styleMask:[.titled,.closable],backing:.buffered,defer:false)
    window.isReleasedWhenClosed=false;window.title="Coordinate and color qualification"
    let view=CoordinateColorView(frame:NSRect(x:0,y:0,width:440,height:280));window.contentView=view
    for (title,selector,x) in [("Move to external",#selector(external),20),("Move home",#selector(home),220)] {
      let button=NSButton(title:title,target:self,action:selector);button.frame=NSRect(x:x,y:215,width:190,height:35);view.addSubview(button)
    }
    window.makeKeyAndOrderFront(nil)
  }
  @objc func external() {
    guard let screen=NSScreen.screens.first(where:{$0.frame.minX != 0 || $0.frame.minY != 0}) else{return}
    window.setFrameOrigin(NSPoint(x:screen.frame.minX+100,y:screen.frame.minY+100))
  }
  @objc func home() {window.setFrameOrigin(NSPoint(x:900,y:120))}
  func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool {true}
}
let app=NSApplication.shared
let delegate=CoordinateColorDelegate()
app.setActivationPolicy(.regular);app.delegate=delegate;app.run()
