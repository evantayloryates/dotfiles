import Foundation

final class EncoderGate: @unchecked Sendable {
  let release=DispatchSemaphore(value:0)
  private let lock=NSLock()
  private var entered=false
  var ready:Bool {lock.withLock{entered}}
  func block(){lock.withLock{entered=true};release.wait()}
}
@main struct EncoderFinalizationTest {
  static func main() async throws {
    guard CommandLine.arguments.count==2 else {fatalError("supply private evidence root")}
    let root=URL(fileURLWithPath:CommandLine.arguments[1])
    try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
    var checks=0
    func check(_ value:Bool,_ name:String) {guard value else{fputs("failed: \(name)\n",stderr);exit(1)};checks+=1}
    func wait(_ name:String,_ condition:()->Bool) async {
      for _ in 0..<5000 {if condition(){return};try? await Task.sleep(nanoseconds:1_000_000)}
      fputs("deadline: \(name)\n",stderr);exit(1)
    }
    func make(_ name:String) throws -> Recording {
      let now=Date()
      return Recording(id:name,dir:root.appendingPathComponent(name).path,target:["type":"synthetic_offscreen"],
        settings:try RecordSettings.from(["fps":25]),label:name,startAt:now,endAt:now.addingTimeInterval(0.2),
        ifLate:"start",idempotencyKey:nil,sessionID:nil)
    }
    let sessions=Sessions(root:root.appendingPathComponent("sessions").path)
    let session=try await sessions.create(["title":"offscreen finalization"]),sid=session.str("session_id")!
    let jobs=Recordings(legacyRoot:root.appendingPathComponent("legacy").path,sessions:sessions)
    let affected=try make("affected"),peer=try make("peer"),gate=EncoderGate()
    affected.qualificationFinalizeBudget=0.08
    affected.qualificationBeforeEncoderFinish={gate.block()}
    defer{gate.release.signal()}
    try affected.qualificationFrames();try peer.qualificationFrames()
    await jobs.qualificationTrack(affected);await jobs.qualificationTrack(peer)
    affected.qualificationFinish()
    await wait("blocked encoder"){gate.ready}
    check(affected.state == .finalizing,"real finalization entered before injected wait")
    check(affected.holdsUnfinishedAdmission,"finalizing producer reserves capacity after requested end")
    await wait("deadline"){affected.state == .interrupted}
    check(affected.captureQuarantined,"deadline retains outstanding encoder admission")
    let replyStart=Date();let deadlineReply=affected.describe()
    check(Date().timeIntervalSince(replyStart)<0.1,"snapshot does not wait on blocked recording queue")
    check(deadlineReply["frames_provenance"] as? String == "persisted_checkpoint_not_final","deadline counters are a checkpoint")
    check((deadlineReply["unfinished_work"] as? [String:Any])?["encoder_finalization"] as? Bool == true,"encoder uncertainty visible")
    check(peer.state == .recording,"watchdog does not mutate peer")
    affected.qualificationRepeatWatchdog()
    check(affected.state == .interrupted,"duplicate watchdog cannot replace terminal result")
    peer.qualificationFinish();await wait("healthy peer"){peer.state.terminal && !peer.holdsUnfinishedAdmission}
    check(peer.state == .done,"healthy actual encoder finalizes while peer queue is blocked")
    await wait("closed failed journal"){(affected.describe()["source_packet"] as? [String:Any])?["state"] as? String == "closed"}
    let outcome=(affected.describe()["source_packet"] as! [String:Any])["video_outcome"] as! [String:Any]
    check(outcome["successful_finalization"] as? Bool == false,"closed ledger does not promise muxed completion")
    check(outcome["writer_status"] is NSNull,"watchdog never queries blocked writer status")
    await wait("saved terminal ledger"){
      guard let data=FileManager.default.contents(atPath:affected.manifestPath),let row=try? JSONSerialization.jsonObject(with:data) as? [String:Any] else{return false}
      return (row["source_packet"] as? [String:Any])?["state"] as? String == "closed"
    }
    check(await jobs.captureHealth["quarantined"] as? Int == 1,"manager exposes only affected quarantine")
    let future=Date().addingTimeInterval(3600),dir=await sessions.dir(sid)
    func parameters() -> [String:Any] { ["target":["type":"display"],"start_at":iso8601.string(from:future),"end_at":iso8601.string(from:future.addingTimeInterval(10))] }
    var reservations:[String]=[]
    for _ in 0..<15 {reservations.append(try await jobs.schedule(parameters(),sessionID:sid,sessionDir:dir).str("recording_id")!)}
    do {_=try await jobs.schedule(parameters(),sessionID:sid,sessionDir:dir);fatalError("unfinished admission bypassed")}
    catch let error as RPCError {check(error.code=="too_many","unfinished terminal producer counts against far-future admission")}
    gate.release.signal()
    await wait("late callback reservation release"){!affected.holdsUnfinishedAdmission}
    affected.q.sync{}
    check(affected.state == .interrupted,"late successful encoder callback cannot resurrect deadline take")
    check((affected.describe()["source_packet"] as! [String:Any])["video_outcome"] as? [String:Any] != nil,"deadline outcome remains available after late callback")
    check((affected.describe()["review"] as? [String:Any]) == nil,"late callback does not run a review")
    check((affected.describe()["error"] as? String)?.contains("deadline exceeded") == true,"original cause survives callback")
    check(await jobs.captureHealth["quarantined"] as? Int == 0,"actual return releases quarantine")
    let final=try await jobs.schedule(parameters(),sessionID:sid,sessionDir:dir)
    reservations.append(final.str("recording_id")!)
    check(reservations.count==16,"released producer permits the sixteenth reservation")
    for id in reservations {let recording=try await jobs.get(id);recording.cancel();_=try await jobs.wait(id,until:"done",timeout:2)}
    check((await jobs.list(["active":true])["total"] as? Int)==0,"owned scheduled peers cleaned without SDK discovery")
    let callbackFirst=try make("callback-first"),callGate=EncoderGate()
    callbackFirst.qualificationFinalizeBudget=0.08
    callbackFirst.qualificationBeforeEncoderFinish={callGate.block()}
    defer{callGate.release.signal()}
    try callbackFirst.qualificationFrames();callbackFirst.qualificationFinish()
    await wait("call blocked before early callback"){callGate.ready}
    callbackFirst.qualificationEarlyCallback()
    check(callbackFirst.holdsUnfinishedAdmission,"callback alone cannot release a still-blocked encoder call")
    await wait("callback-first watchdog"){callbackFirst.state == .interrupted}
    check(callbackFirst.captureQuarantined,"callback-first call stall still reaches terminal quarantine")
    callGate.release.signal();await wait("callback-first actual return"){!callbackFirst.holdsUnfinishedAdmission}
    callbackFirst.q.sync{}
    check(callbackFirst.state == .interrupted,"actual late return preserves callback-first deadline")
    let empty=try make("empty-writer"),emptyGate=EncoderGate()
    empty.qualificationFinalizeBudget=0.08
    empty.qualificationBeforeEncoderFinish={emptyGate.block()}
    defer{emptyGate.release.signal()}
    try empty.qualificationEmptyWriter();empty.qualificationFinish()
    await wait("empty writer before finish"){emptyGate.ready}
    await wait("empty writer deadline"){empty.state == .interrupted}
    check(empty.captureQuarantined,"empty writer call holds capacity through deadline")
    emptyGate.release.signal();await wait("empty writer return"){!empty.holdsUnfinishedAdmission}
    empty.q.sync{}
    check(empty.state == .interrupted,"late empty cancellation cannot replace deadline")
    check((empty.describe()["source_packet"] as! [String:Any])["video_outcome"] is [String:Any],"empty writer deadline retains explicit outcome")
    let result:[String:Any] = ["passed":checks,"scope":"actual AVAssetWriter and recording queues, controlled finalization blockage, late callback, partial outcome, healthy peer and manager admission; authored 32x32 frames only; no SDK capture, UI or natural hardware stall", "affected":affected.describe(),"peer":peer.describe()]
    try jsonData(result,options:[.prettyPrinted,.sortedKeys])!.write(to:root.appendingPathComponent("proof.json"))
    print("{\"passed\":\(checks),\"scope\":\"offscreen encoder finalization, watchdog and admission; no screen or UI\"}")
  }
}
