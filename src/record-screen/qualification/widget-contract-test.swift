import Foundation

@main
struct WidgetContractTest {
  static func main() {
    var checks=0
    func check(_ value:Bool){precondition(value);checks+=1}
    let fresh=Snapshot(sampledAt:Date(),phase:"recording",active:1,queued:2,actions:3,paused:false)
    check(!fresh.stale);check(fresh.title=="Recording")
    check(Snapshot.unavailable.stale);check(Snapshot.unavailable.title=="Status unavailable")
    check(Snapshot(sampledAt:Date().addingTimeInterval(-31),phase:"idle",active:0,queued:0,actions:0,paused:false).stale)
    check(Snapshot(sampledAt:Date().addingTimeInterval(6),phase:"idle",active:0,queued:0,actions:0,paused:false).stale)
    for (action,method) in [("pause","production.pause"),("resume","production.resume"),("panel","production.panel.show")] {
      check(RecorderControl.method(for:URL(string:"record-screen-control://"+action)!)==method)
    }
    for url in ["https://pause","record-screen-control://erase","record-screen-control://pause?replay=true","record-screen-control://pause/path","record-screen-control://pause#command","record-screen-control://user@pause","record-screen-control://pause:123"] {
      check(RecorderControl.method(for:URL(string:url)!)==nil)
    }
    do {_ = try RecorderControl.call("maintenance.restart");preconditionFailure("Unsafe method admitted")}
    catch {checks+=1}
    print("\(checks) widget contract checks passed")
  }
}
