// Owned post-restart canary. No activation, global monitor, synthesis or literal text.
import AppKit
func witness(_ data: [String:Any]) {
  var row=data;row["received_host_ns"]=String(clock_gettime_nsec_np(CLOCK_UPTIME_RAW))
  row["foreground_pid"]=NSWorkspace.shared.frontmostApplication?.processIdentifier
  let url=URL(fileURLWithPath:Bundle.main.bundlePath).deletingLastPathComponent().appendingPathComponent("witness-\(getpid()).jsonl")
  if !FileManager.default.fileExists(atPath:url.path){FileManager.default.createFile(atPath:url.path,contents:nil,attributes:[.posixPermissions:0o600])}
  if let file=try? FileHandle(forWritingTo:url),var data=try? JSONSerialization.data(withJSONObject:row,options:.sortedKeys){file.seekToEndOfFile();data.append(10);file.write(data);try? file.close()}
}
final class Canvas:NSView {
 override var acceptsFirstResponder:Bool{true}
 var changed=false
 override func draw(_ dirtyRect:NSRect){NSColor.white.setFill();bounds.fill();(changed ? NSColor.magenta:NSColor.green).setFill();NSRect(x:30,y:70,width:80,height:80).fill()}
 override func keyDown(with e:NSEvent){changed.toggle();needsDisplay=true;witness(["kind":"key_down","cg_timestamp_ns":String(e.cgEvent?.timestamp ?? 0),"key_code":e.keyCode,"window_id":window?.windowNumber ?? 0])}
 override func keyUp(with e:NSEvent){witness(["kind":"key_up","cg_timestamp_ns":String(e.cgEvent?.timestamp ?? 0),"key_code":e.keyCode,"window_id":window?.windowNumber ?? 0])}
}
final class Delegate:NSObject,NSApplicationDelegate {
 var window:NSWindow!
 let canvas=Canvas(frame:NSRect(x:0,y:0,width:300,height:200))
 func applicationDidFinishLaunching(_ n:Notification){
  window=NSWindow(contentRect:NSRect(x:100,y:100,width:300,height:200),styleMask:[.titled,.closable],backing:.buffered,defer:false)
  window.title="Owned background witness77";window.isReleasedWhenClosed=false;window.contentView=canvas;window.makeKeyAndOrderFront(nil);window.makeFirstResponder(canvas)
  let bar=NSMenu(),root=NSMenuItem(),menu=NSMenu();root.submenu=menu;bar.addItem(root);menu.addItem(withTitle:"Quit owned witness",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q");NSApp.mainMenu=bar
  witness(["kind":"ready","pid":getpid(),"window_id":window.windowNumber,"activation_requested":false])
 }
 func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{true}
 func applicationWillTerminate(_ n:Notification){witness(["kind":"terminated"])}
}
let app=NSApplication.shared,delegate=Delegate();app.setActivationPolicy(.accessory);app.delegate=delegate;app.run()
