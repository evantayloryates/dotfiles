import AppKit

// Owned cross-app occlusion oracle. Only native UI buttons show/hide the cover.
// TargetFrame is frozen into this private fixture bundle before launch.
final class OcclusionDelegate: NSObject, NSApplicationDelegate {
  var controls:NSWindow!
  var cover:NSWindow?
  var deadline:Timer?
  var output:FileHandle!
  func write(_ kind:String) {
    let row:[String:Any]=["kind":kind,"host_ns":String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)),"pid":getpid()]
    guard var data=try? JSONSerialization.data(withJSONObject:row,options:[.sortedKeys]) else {return}
    data.append(10);output.write(data)
  }
  func applicationDidFinishLaunching(_ notification:Notification) {
    let file=Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("occlusion-\(getpid()).jsonl")
    _=FileManager.default.createFile(atPath:file.path,contents:nil);output=try! FileHandle(forWritingTo:file)
    let menu=NSMenu(),item=NSMenuItem();menu.addItem(item);item.submenu=NSMenu()
    item.submenu?.addItem(withTitle:"Quit owned occlusion fixture",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
    NSApp.mainMenu=menu
    controls=NSWindow(contentRect:NSRect(x:1160,y:750,width:300,height:130),styleMask:[.titled,.closable],backing:.buffered,defer:false)
    controls.title="Owned occlusion controls";controls.isReleasedWhenClosed=false
    let show=NSButton(title:"Cover authored source (20s maximum)",target:self,action:#selector(showCover));show.frame=NSRect(x:10,y:75,width:280,height:32)
    let hide=NSButton(title:"Remove owned cover",target:self,action:#selector(hideCover));hide.frame=NSRect(x:10,y:30,width:280,height:32)
    controls.contentView?.addSubview(show);controls.contentView?.addSubview(hide)
    controls.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true);write("controls_ready")
  }
  @objc func showCover() {
    guard cover == nil,let box=Bundle.main.object(forInfoDictionaryKey:"TargetFrame") as? [String:Double],
      let x=box["x"],let y=box["y"],let w=box["w"],let h=box["h"],
      [x,y,w,h].allSatisfy({$0.isFinite}),w>0,h>0,let main=NSScreen.screens.first else {return}
    // Qualification is scoped to the current main display; no Space/display move.
    let frame=NSRect(x:x,y:main.frame.maxY-y-h,width:w,height:h)
    let c=NSWindow(contentRect:frame,styleMask:[.borderless],backing:.buffered,defer:false)
    c.title="Owned opaque insurance cover";c.isReleasedWhenClosed=false;c.isOpaque=true
    c.backgroundColor=NSColor(srgbRed:0.85,green:0.15,blue:0.5,alpha:1)
    c.level = .floating
    c.orderFrontRegardless();cover=c;write("cover_shown")
    deadline=Timer.scheduledTimer(withTimeInterval:20,repeats:false){[weak self] _ in self?.hideCover()}
  }
  @objc func hideCover() {
    deadline?.invalidate();deadline=nil
    if let c=cover {c.close();cover=nil;write("cover_removed")}
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool {true}
  func applicationWillTerminate(_ notification:Notification) {hideCover();write("fixture_exited")}
}
let application=NSApplication.shared
let delegate=OcclusionDelegate()
application.setActivationPolicy(.regular);application.delegate=delegate;application.run()
