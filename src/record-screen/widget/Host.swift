import AppKit
import WidgetKit

@MainActor
final class WidgetHost:NSObject,NSApplicationDelegate {
  private var timer:Timer?
  private var busy=false
  private var last:Snapshot?
  private var lastReload=Date.distantPast
  private var lastPublished=Date.distantPast
  private var lastSample=Date.distantPast
  func applicationDidFinishLaunching(_ note:Notification) {
    refresh();timer=Timer.scheduledTimer(withTimeInterval:1,repeats:true){[weak self] _ in MainActor.assumeIsolated{self?.refresh()}}
  }
  func application(_ app:NSApplication,open urls:[URL]) {
    for url in urls {
      guard let method=RecorderControl.method(for:url) else{continue}
      // Each deliberate URL activation is one attempt. Never replay on an uncertain reply.
      Task {
        let result=await Task.detached{Result{try RecorderControl.call(method)}}.value
        if case .failure(let error)=result {FileHandle.standardError.write(Data("Widget control: \(error)\n".utf8))}
        refresh()
      }
    }
  }
  private func refresh() {
    guard !busy else{return};busy=true
    Task {
      let shouldSample=Date().timeIntervalSince(lastSample)>=3
      let result=await Task.detached { () -> (Snapshot?,Bool) in
        let handled=ControlMailbox.process { paused in
          _ = try RecorderControl.call(paused ? "production.pause" : "production.resume")
          return try RecorderControl.sample()
        }
        return (shouldSample || handled ? ((try? RecorderControl.sample()) ?? .unavailable) : nil,handled)
      }.value
      defer{busy=false}
      guard let sample=result.0 else{return};lastSample=Date()
      guard let url=WidgetBridge.snapshotURL else{return}
      let changed=last.map{($0.phase,$0.active,$0.queued,$0.actions,$0.paused) != (sample.phase,sample.active,sample.queued,sample.actions,sample.paused)} ?? true
      if changed || result.1 || Date().timeIntervalSince(lastPublished)>=20 {
        do {
          try JSONEncoder().encode(sample).write(to:url,options:.atomic)
          try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:url.path)
          last=sample;lastPublished=Date()
          if Date().timeIntervalSince(lastReload)>=3 {WidgetCenter.shared.reloadTimelines(ofKind:WidgetBridge.kind);lastReload=Date()}
        } catch {FileHandle.standardError.write(Data("Widget snapshot unavailable\n".utf8))}
      }
    }
  }
}

@main
struct HostMain {
  @MainActor static func main() {
    if CommandLine.arguments.contains("--configurations") {
      WidgetCenter.shared.getCurrentConfigurations { result in
        switch result {
        case .success(let values):print("{\"configured_widgets\":\(values.filter{$0.kind==WidgetBridge.kind}.count)}");exit(0)
        case .failure:print("{\"error\":\"Widget configuration unavailable\"}");exit(1)
        }
      }
      RunLoop.main.run();return
    }
    if let at=CommandLine.arguments.firstIndex(of:"--control-url") {
      do {
        guard CommandLine.arguments.count==at+2,let url=URL(string:CommandLine.arguments[at+1]),let method=RecorderControl.method(for:url) else{throw RecorderControl.Failure("Invalid control URL")}
        let result=try RecorderControl.call(method)
        print(String(data:try JSONSerialization.data(withJSONObject:result),encoding:.utf8)!);return
      } catch {fputs("\(error)\n",stderr);exit(1)}
    }
    if CommandLine.arguments.contains("--probe") {
      do {
        guard let url=WidgetBridge.snapshotURL else{throw RecorderControl.Failure("Shared container unavailable")}
        let sample=try RecorderControl.sample();try JSONEncoder().encode(sample).write(to:url,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:url.path)
        print(String(data:try JSONEncoder().encode(sample),encoding:.utf8)!);return
      } catch {fputs("\(error)\n",stderr);exit(1)}
    }
    let app=NSApplication.shared;app.setActivationPolicy(.accessory)
    let delegate=WidgetHost();app.delegate=delegate;withExtendedLifetime(delegate){app.run()}
  }
}
