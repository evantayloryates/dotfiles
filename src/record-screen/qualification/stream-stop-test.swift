import Foundation

final class StopGate:@unchecked Sendable {
  private let lock=NSLock()
  private var continuation:CheckedContinuation<Void,Error>?
  var ready:Bool {lock.withLock {continuation != nil}}
  func wait() async throws {try await withCheckedThrowingContinuation {c in lock.withLock {continuation=c}}}
  func complete(error:Error?=nil) {
    let c=lock.withLock {let c=continuation;continuation=nil;return c}
    if let error {c?.resume(throwing:error)} else {c?.resume()}
  }
}
final class StopObservations:@unchecked Sendable {
  private let lock=NSLock()
  private var values:[[String:Any]]=[]
  func append(_ value:[String:Any]){lock.withLock {values.append(value)}}
  var count:Int {lock.withLock {values.count}}
}
@main struct StreamStopTest {
  static func main() async throws {
    guard CommandLine.arguments.count==2 else {fatalError("private evidence root required")}
    let root=URL(fileURLWithPath:CommandLine.arguments[1]);try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
    var checks=0
    func check(_ value:Bool,_ reason:String) {guard value else{fputs("failed: \(reason)\n",stderr);exit(1)};checks+=1}
    func wait(_ name:String,_ condition:()->Bool) async {
      for _ in 0..<5000 {if condition(){return};try? await Task.sleep(nanoseconds:1_000_000)}
      fputs("deadline: \(name)\n",stderr);exit(1)
    }
    let ledger=StreamStopLedger(recordingID:"controlled"),notes=StopObservations(),pending=StopGate()
    ledger.onChange={value in notes.append(value);_=ledger.status} // reentrant read must remain safe
    ledger.start(seconds:0.04){try await pending.wait()}
    await wait("request start"){pending.ready}
    check(ledger.heldCount==1,"reservation before SDK acknowledgment")
    check(ledger.status["producer_pending"] as? Int==1,"actual unfinished producer distinguished")
    await wait("deadline observed"){ledger.status["overdue"] as? Int==1}
    check(ledger.heldCount==1,"deadline does not release reservation")
    check(ledger.status["requests"] as? Int==1,"deadline never retries SDK stop")
    check(notes.count>=2,"start and overdue observations delivered outside lock")
    let overdue=ledger.status
    pending.complete();await wait("late success"){ledger.heldCount==0}
    let late=ledger.status["latest_result"] as! [String:Any]
    check(late["acknowledged"] as? Bool==true,"actual late success releases reservation")
    check(late["deadline_exceeded"] as? Bool==true,"late result preserves deadline history")
    check(late["producer_finished"] as? Bool==true,"late producer return visible")
    check(late["completed_ns"] is String,"actual completion clock retained")
    let returnedError=StopGate()
    ledger.start(seconds:0.04){try await returnedError.wait()}
    await wait("error request"){returnedError.ready}
    returnedError.complete(error:RPCError(code:"qualification",message:String(repeating:"x",count:1000)))
    await wait("returned stop error"){ledger.status["unconfirmed_errors"] as? Int==1}
    check(ledger.heldCount==1,"returned error remains reserved")
    check(ledger.status["producer_pending"] as? Int==0,"returned error is not described as a still-running producer")
    let error=ledger.status["latest_result"] as! [String:Any]
    check((error["error"] as? String)?.count==512,"error diagnostic is bounded")
    check(error["acknowledged"] as? Bool==false,"error does not imply resource release")
    let success=StopGate();ledger.start(seconds:0.5){try await success.wait()}
    await wait("healthy adjacent stop"){success.ready};success.complete()
    await wait("healthy success"){ledger.status["producer_pending"] as? Int==0}
    check(ledger.heldCount==1,"healthy stop preserves unrelated unconfirmed reservation")
    check(ledger.status["requests"] as? Int==3,"exactly one producer per requested owned stop")

    func make(_ name:String,_ gate:StopGate) throws -> Recording {
      let now=Date()
      return Recording(id:name,dir:root.appendingPathComponent(name).path,target:["type":"display"],
        settings:try RecordSettings.from([:]),label:name,startAt:now,endAt:now.addingTimeInterval(30),ifLate:"start",idempotencyKey:nil,sessionID:nil,
        startupPreflight:{try await gate.wait()},startupBudgetSeconds:10)
    }
    let startup=StopGate(),peerStartup=StopGate(),stop=StopGate(),affected=try make("affected",startup),peer=try make("peer",peerStartup)
    affected.schedule();peer.schedule();await wait("owned arming"){startup.ready && peerStartup.ready}
    affected.qualificationStopWork(seconds:0.04){try await stop.wait()}
    await wait("owned stop producer"){stop.ready}
    affected.cancel();await wait("owned canceled"){affected.state == .canceled}
    startup.complete(error:RPCError(code:"qualification",message:"preflight stops before SDK discovery"))
    await wait("startup returned"){(affected.describe()["unfinished_work"] as? [String:Any])?["startup"] as? Bool==false}
    await wait("owned stop overdue"){((affected.describe()["unfinished_work"] as? [String:Any])?["stream_stop_work"] as? [String:Any])?["overdue"] as? Int==1}
    check(affected.captureQuarantined,"actual terminal recording retains overdue stop admission")
    check(peer.state == .arming,"affected stop does not interrupt peer preflight")
    let terminalOverdue=affected.describe()
    stop.complete();await wait("actual late stop returned"){!affected.holdsUnfinishedAdmission}
    check(affected.state == .canceled,"stop acknowledgment cannot resurrect terminal recording")
    affected.q.sync{}
    let errorStop=StopGate();affected.qualificationStopWork(seconds:0.1){try await errorStop.wait()}
    await wait("actual failed stop"){errorStop.ready};errorStop.complete(error:RPCError(code:"qualification",message:"owned unconfirmed stop"))
    await wait("failed stop reserved"){((affected.describe()["unfinished_work"] as? [String:Any])?["stream_stop_work"] as? [String:Any])?["unconfirmed_errors"] as? Int==1}
    check(affected.captureQuarantined,"actual stop error retains terminal admission")
    let sessions=Sessions(root:root.appendingPathComponent("sessions").path)
    let session=try await sessions.create(["title":"controlled stop admission"]),sid=session.str("session_id")!,dir=await sessions.dir(sid)
    let jobs=Recordings(legacyRoot:root.appendingPathComponent("legacy").path,sessions:sessions)
    await jobs.qualificationTrack(affected)
    check(await jobs.captureHealth["quarantined"] as? Int==1,"manager exposes actual unconfirmed stop")
    let future=Date().addingTimeInterval(3600)
    let parameters:[String:Any]=["target":["type":"display"],"start_at":iso8601.string(from:future),"end_at":iso8601.string(from:future.addingTimeInterval(10))]
    var ids:[String]=[]
    for _ in 0..<15 {ids.append(try await jobs.schedule(parameters,sessionID:sid,sessionDir:dir).str("recording_id")!)}
    do {_=try await jobs.schedule(parameters,sessionID:sid,sessionDir:dir);fatalError("failed stop bypassed admission")}
    catch let error as RPCError {check(error.code=="too_many","unconfirmed terminal stop counts against unrelated future interval")}
    for id in ids {let r=try await jobs.get(id);r.cancel();_=try await jobs.wait(id,until:"done",timeout:2)}
    peerStartup.complete(error:RPCError(code:"qualification",message:"owned cleanup before SDK"))
    await wait("peer cleanup"){peer.state.terminal && !peer.holdsUnfinishedAdmission}
    affected.q.sync{}
    let manifest=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:affected.manifestPath))) as! [String:Any]
    check((manifest["unfinished_work"] as? [String:Any])?["stream_stops"] as? Int==1,"unconfirmed stop saved in manifest")
    check((manifest["unfinished_work"] as? [String:Any])?["stream_stop_failures"] as? Int==1,"returned error saved distinctly")
    check(manifest["state"] as? String=="canceled","persistence preserves terminal state")
    check(peer.state == .failed,"owned peer cleaned without actual SDK discovery")
    let proof:[String:Any]=["passed":checks,"scope":"controlled async stop outcomes and actual recording/admission/persistence; preflight blocks before SDK; no capture, UI or natural stopCapture error","overdue":overdue,"late_acknowledgment":late,"returned_error":error,"terminal_overdue":terminalOverdue,"terminal_error":affected.describe(),"peer":peer.describe()]
    try jsonData(proof,options:[.prettyPrinted,.sortedKeys])!.write(to:root.appendingPathComponent("proof.json"))
    print("{\"passed\":\(checks),\"scope\":\"controlled stop deadline/late acknowledgment/error and actual recording/admission; no SDK or UI\"}")
  }
}
