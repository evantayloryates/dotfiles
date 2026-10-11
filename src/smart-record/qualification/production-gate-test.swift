import Foundation

@main struct ProductionGateTest {
  static func main() async throws {
    let root=FileManager.default.temporaryDirectory.appendingPathComponent("production-gate-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
    defer {try? FileManager.default.removeItem(at:root)}
    var checks=0
    func check(_ b:Bool,_ why:String){guard b else{fatalError(why)};checks+=1}
    let path=root.appendingPathComponent("gate.json").path,gate=ProductionGate(path:path)
    let generation=gate.snapshot.generation
    check(gate.admit("active",generation:generation),"first start admitted")
    try gate.setPaused(true)
    check(!gate.admit("new",generation:gate.snapshot.generation),"paused admission refused")
    check((gate.status["admitted_captures"] as? [String])==["active"],"pause preserves existing producer")
    check(ProductionGate(path:path).snapshot.paused,"pause persisted across independent instance")
    gate.release("active");check((gate.status["admitted_captures"] as? [String])?.isEmpty==true,"drain release recorded")
    try gate.setPaused(false)
    check(!gate.admit("stale-timer",generation:generation),"pre-pause timer cannot bypass resumed generation")
    check(gate.admit("fresh",generation:gate.snapshot.generation),"fresh resumed start admitted");gate.release("fresh")
    DispatchQueue.concurrentPerform(iterations:128){i in _=gate.admit("race-\(i)",generation:gate.snapshot.generation)}
    check((gate.status["admitted_captures"] as? [String])?.count==16,"concurrent starts obey shared cap")
    for i in 0..<128 {gate.release("race-\(i)")}
    try Data("invalid".utf8).write(to:URL(fileURLWithPath:path))
    let broken=ProductionGate(path:path);check(broken.snapshot.paused,"invalid persisted state fails closed")
    try broken.setPaused(false);check(!ProductionGate(path:path).snapshot.paused,"explicit resume repairs invalid state")

    let sessions=Sessions(root:root.appendingPathComponent("sessions").path)
    let session=try await sessions.create(["title":"production queue offline"]),sid=session.str("session_id")!,dir=await sessions.dir(sid)
    let paused=ProductionGate(path:root.appendingPathComponent("queue-gate.json").path);try paused.setPaused(true)
    let jobs=Recordings(legacyRoot:root.appendingPathComponent("legacy").path,sessions:sessions,productionGate:paused)
    let start=Date().addingTimeInterval(3600)
    var ids:[String]=[]
    for i in 0..<20 {
      let p:[String:Any]=["target":["type":"display"],"start_at":iso8601.string(from:start),"end_at":iso8601.string(from:start.addingTimeInterval(10)),"idempotency_key":"queued-\(i)"]
      let row=try await jobs.schedule(p,sessionID:sid,sessionDir:dir);ids.append(row.str("recording_id")!)
      let again=try await jobs.schedule(p,sessionID:sid,sessionDir:dir)
      check(again.str("recording_id")==ids.last,"queued idempotency stable")
    }
    check((await jobs.productionStatus["queued"] as? [[String:Any]])?.count==20,"paused queue exceeds capture slots without starting")
    let restored=Recordings(legacyRoot:root.appendingPathComponent("legacy").path,sessions:sessions,productionGate:ProductionGate(path:root.appendingPathComponent("queue-gate.json").path))
    await restored.load()
    check((await restored.productionStatus["queued"] as? [[String:Any]])?.count==20,"queued manifests reload under durable pause")
    for id in ids {let rec=try await jobs.get(id);rec.cancel();_=try await jobs.wait(id,until:"done",timeout:2)}

    let lateGate=ProductionGate();try lateGate.setPaused(true)
    let now=Date()
    let rec=Recording(id:"late",dir:root.appendingPathComponent("late").path,target:["type":"display"],settings:try RecordSettings.from([:]),label:"held",startAt:now.addingTimeInterval(-1),endAt:now.addingTimeInterval(60),ifLate:"start",idempotencyKey:nil,sessionID:nil,productionGate:lateGate)
    rec.schedule();try await Task.sleep(nanoseconds:30_000_000)
    try lateGate.setPaused(false);rec.schedule();try await Task.sleep(nanoseconds:30_000_000)
    check(rec.state == .scheduled,"elapsed queued request does not start on resume")
    check((rec.describe()["production_queue"] as? [String:Any])?.bool("requires_reschedule")==true,"elapsed schedule explicitly needs rescheduling")
    try rec.reschedule(start:Date().addingTimeInterval(3600),end:Date().addingTimeInterval(3610))
    try await Task.sleep(nanoseconds:30_000_000)
    check((rec.describe()["production_queue"] as? [String:Any])?.bool("requires_reschedule")==false,"explicit future reschedule clears hold")
    rec.cancel();try await Task.sleep(nanoseconds:30_000_000)
    print("{\"passed\":\(checks),\"scope\":\"durable pause, concurrent admissions, stale timers, queued idempotency/reload and explicit elapsed reschedule; no SDK capture or UI\"}")
  }
}
