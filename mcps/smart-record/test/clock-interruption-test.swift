import Foundation

/// Controlled preflight never reaches target discovery, permission or UI.
final class ClockStartupGate: @unchecked Sendable {
  private let lock=NSLock()
  private var continuation:CheckedContinuation<Void,Error>?
  var ready:Bool {lock.withLock {continuation != nil}}
  func wait() async throws {try await withCheckedThrowingContinuation { c in lock.withLock {continuation=c} }}
  func fail() {lock.withLock {let c=continuation;continuation=nil;return c}?.resume(throwing:RPCError(code:"qualification",message:"owned late preflight failure"))}
}
@main struct ClockInterruptionTest {
  static func main() async throws {
    var checks=0
    func check(_ ok:Bool,_ message:String) {guard ok else{fputs("failed: \(message)\n",stderr);exit(1)};checks+=1}
    func wait(_ condition:()->Bool) async {
      for _ in 0..<1000 {if condition(){return};try? await Task.sleep(nanoseconds:1_000_000)}
      fputs("condition deadline\n",stderr);exit(1)
    }
    let root=FileManager.default.temporaryDirectory.appendingPathComponent("clock-interruption-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
    defer{try? FileManager.default.removeItem(at:root)}
    func make(_ id:String,_ gate:ClockStartupGate) throws -> Recording {
      let now=Date()
      return Recording(id:id,dir:root.appendingPathComponent(id).path,target:["type":"display"],
        settings:try RecordSettings.from([:]),label:"clock-test",startAt:now,endAt:now.addingTimeInterval(30),
        ifLate:"start",idempotencyKey:nil,sessionID:nil,startupPreflight:{try await gate.wait()})
    }
    let gate=ClockStartupGate(),peerGate=ClockStartupGate(),recording=try make("affected",gate),peer=try make("peer",peerGate)
    recording.schedule();peer.schedule();await wait{gate.ready && peerGate.ready}
    let packet=recording.describe()["source_packet"] as! [String:Any]
    let clock=packet["clock_continuity"] as! [String:Any],latest=clock["latest_observation"] as! [String:Any]
    let up=UInt64(latest["uptime_after_ns"] as! String)!,continuous=UInt64(latest["continuous_ns"] as! String)!
    let interrupted=recording.q.sync {
      recording.observeHostClock(HostClockSample(uptimeBefore:up+1_000_000,continuous:continuous+11_000_000_000,uptimeAfter:up+1_000_010))
    }
    check(!interrupted && recording.state == .failed,"arming gap refuses footage before target discovery")
    check(peer.state == .arming,"affected boundary leaves peer preflight intact")
    check(recording.captureQuarantined,"unfinished producer retains admission after clock stop")
    check((recording.describe()["error"] as? String)?.contains("without filling") == true,"explicit recovery reason")
    gate.fail();await wait{!recording.captureQuarantined}
    check(recording.state == .failed,"late result cannot resurrect clock-interrupted take")
    await wait{(recording.describe()["source_packet"] as? [String:Any])?["state"] as? String == "closed"}
    let rows=try String(contentsOfFile:recording.dir+"/source.jsonl",encoding:.utf8).split(separator:"\n").map {
      try JSONSerialization.jsonObject(with:Data($0.utf8)) as! [String:Any]
    }
    check(rows.filter{$0["kind"] as? String == "clock_gap"}.count == 1,"single boundary persisted")
    check(!rows.contains{$0["kind"] as? String == "encoded_frame"},"arming failure invents no encoded coverage")
    check(peer.state == .arming,"late affected result does not stop peer")
    peerGate.fail();await wait{!peer.captureQuarantined && peer.state.terminal}
    print("{\"passed\":\(checks),\"scope\":\"actual recording arming interruption, retained producer admission, peer isolation and late-result cleanup; no SDK capture or actual sleep\"}")
  }
}
