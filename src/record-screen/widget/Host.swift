import AppKit
import WidgetKit

@MainActor
final class WidgetHost:NSObject,NSApplicationDelegate {
  private var timer:Timer?
  private var busy=false
  private var last:Snapshot?
  private var lastReload=Date.distantPast
  func applicationDidFinishLaunching(_ note:Notification) {
    refresh();timer=Timer.scheduledTimer(withTimeInterval:3,repeats:true){[weak self] _ in MainActor.assumeIsolated{self?.refresh()}}
  }
  func application(_ app:NSApplication,open urls:[URL]) {
    for url in urls {
      guard url.scheme=="record-screen-control",url.path.isEmpty,url.query==nil,url.fragment==nil,
            let action=url.host,["pause","resume","panel"].contains(action) else{continue}
      // Each deliberate URL activation is one attempt. Never replay on an uncertain reply.
      Task {
        let result=await Task.detached{Result{try RecorderControl.call(action=="panel" ? "production.panel.show" : "production."+action)}}.value
        if case .failure(let error)=result {FileHandle.standardError.write(Data("Widget control: \(error)\n".utf8))}
        refresh()
      }
    }
  }
  private func refresh() {
    guard !busy else{return};busy=true
    Task {
      let sample=await Task.detached{(try? RecorderControl.sample()) ?? .unavailable}.value
      defer{busy=false}
      guard let url=WidgetBridge.snapshotURL else{return}
      let changed=last.map{($0.phase,$0.active,$0.queued,$0.actions,$0.paused) != (sample.phase,sample.active,sample.queued,sample.actions,sample.paused)} ?? true
      if changed || Date().timeIntervalSince(last?.sampledAt ?? .distantPast)>=20 {
        do {
          try JSONEncoder().encode(sample).write(to:url,options:.atomic)
          try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:url.path)
          last=sample
          if Date().timeIntervalSince(lastReload)>=3 {WidgetCenter.shared.reloadTimelines(ofKind:WidgetBridge.kind);lastReload=Date()}
        } catch {FileHandle.standardError.write(Data("Widget snapshot unavailable\n".utf8))}
      }
    }
  }
}

@main
struct HostMain {
  @MainActor static func main() {
    if CommandLine.arguments.contains("--probe") {
      do {
        guard let url=WidgetBridge.snapshotURL else{throw RecorderControl.Failure("Shared container unavailable")}
        let sample=try RecorderControl.sample();try JSONEncoder().encode(sample).write(to:url,options:.atomic)
        print(String(data:try JSONEncoder().encode(sample),encoding:.utf8)!);return
      } catch {fputs("\(error)\n",stderr);exit(1)}
    }
    let app=NSApplication.shared;app.setActivationPolicy(.accessory)
    let delegate=WidgetHost();app.delegate=delegate;withExtendedLifetime(delegate){app.run()}
  }
}
