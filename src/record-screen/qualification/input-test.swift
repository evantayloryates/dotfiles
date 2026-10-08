import Foundation
import CoreGraphics

final class TestClock: @unchecked Sendable {
  let lock=NSLock(); var value:UInt64=9_007_199_254_740_999
  func now() -> UInt64 { lock.withLock { value } }
  func advance(_ ns:UInt64) { lock.withLock { value+=ns } }
}
@main struct InputTest {
  static func main() async throws {
    var checks=0
    func check(_ value:Bool,_ name:String) { guard value else { fatalError(name) }; checks+=1 }
    func rejected(_ name:String,_ block:() throws -> Void) { do { try block(); fatalError(name) } catch { checks+=1 } }
    var policy=InteractionScopePolicy()
    var context=InteractionScopeContext(pid:100,windowID:10,frame:CGRect(x:0,y:0,width:100,height:100))
    var key=InteractionSample(type:10,receivedNS:100,destinationPID:100,keyCode:12)
    check(policy.evaluate(key,context).retain,"keys delivered to app without focused text input")
    check(policy.evaluate(key,context).certainty=="app_delivery_window_unresolved","keyboard window uncertainty explicit")
    key.secureInput=true
    check(!policy.evaluate(key,context).retain,"protected input never retains keyboard codes even if delivered")
    key.secureInput=false
    key.destinationPID=200; context.foregroundPID=200
    check(!policy.evaluate(key,context).retain,"unrelated unmodified typing excluded")
    context.actionIDs=["a"]; key.flags=1<<20
    check(policy.evaluate(key,context).reasons.contains("declared_action_keyboard_candidate"),"global shortcut candidate retained in declared action")
    check(policy.evaluate(key,context).certainty=="candidate","action interval never proves agent ownership")
    context.ambiguousKeys="none"
    check(!policy.evaluate(key,context).retain,"none excludes unrelated shortcut")
    context.ambiguousKeys="all"; key.flags=0
    check(policy.evaluate(key,context).retain,"explicit all retains broad keys with uncertainty")
    context.actionIDs=[]
    check(!policy.evaluate(key,context).retain,"all requires bounded action")
    context.foregroundPID=100
    check(policy.evaluate(key,context).reasons==["foreground_app_candidate"],"foreground fallback remains candidate")
    context.foregroundPID=0
    var pointer=InteractionSample(type:5,receivedNS:200,destinationPID:100,windowUnderPointer:11,x:20,y:20)
    check(!policy.evaluate(pointer,context).retain,"same app other normal window does not leak")
    context.transientWindows=[11]
    check(policy.evaluate(pointer,context).reasons.contains("transient_surface_candidate"),"candidate transient surface retained")
    context.transientWindows=[]; pointer.windowUnderPointer=10
    check(policy.evaluate(pointer,context).certainty=="window_clue","destination and window corroboration")
    pointer.destinationPID=0; pointer.windowUnderPointer=0
    check(policy.evaluate(pointer,context).retain,"pointer location fallback")
    context.retainPointerInFrame=false
    check(!policy.evaluate(pointer,context).retain,"location fallback configurable")
    pointer.type=1; pointer.sourcePID=300; pointer.destinationPID=100; pointer.windowUnderPointer=10; pointer.eventNumber=7
    check(policy.evaluate(pointer,context).retain,"drag starts in scope")
    pointer.type=6; pointer.receivedNS=300; pointer.destinationPID=200; pointer.windowUnderPointer=12; pointer.x=500
    check(policy.evaluate(pointer,context).reasons==["drag_started_in_scope_candidate"],"drag follows start outside frame")
    pointer.sourcePID=301
    check(!policy.evaluate(pointer,context).retain,"different provider PID cannot inherit drag")
    pointer.sourcePID=300; pointer.type=2
    check(policy.evaluate(pointer,context).retain,"matching release retained")
    pointer.type=6
    check(!policy.evaluate(pointer,context).retain,"release clears drag")
    pointer.type=1; pointer.destinationPID=100; pointer.windowUnderPointer=10; pointer.receivedNS=400
    _=policy.evaluate(pointer,context)
    pointer.type=6; pointer.destinationPID=200; pointer.windowUnderPointer=12; pointer.receivedNS=30_000_000_401
    check(!policy.evaluate(pointer,context).retain,"stale drag expires")
    context.pid=nil; context.windowID=nil; context.actionIDs=[]
    check(!policy.evaluate(key,context).retain,"display capture does not import every key")
    context.actionIDs=["a"]; context.ambiguousKeys="shortcuts"; key.flags=1<<18
    check(policy.evaluate(key,context).retain,"display shortcut annotation requires action scope")
    for invalid:[String:Any] in [["enabled":1],["pointer_in_frame":"true"],["ambiguous_keys":"text"],["ambiguous_keys":2],["unknown":true]] {
      rejected("invalid input settings") { _=try InputSettings.parse(invalid) }
    }
    check(try InputSettings.parse(nil).enabled,"new captures default input enabled")
    check(!InputSettings.saved(nil).enabled,"legacy manifests do not enable new observation")

    for key in ["display_id","window_id"] {
      for value:Any in [true,-1,0,1.5,Double(UInt32.max)+1,Double.infinity,"123"] {
        rejected("malformed identifier rejected before conversion") { _=try TargetSpec.parse(["type":key=="display_id" ? "display" : "window",key:value]) }
      }
    }
    for value:Any in [true,Double.infinity,1e100,"800",-1] {
      rejected("malformed dimension") { _=try TargetSpec.parse(["type":"rect","x":0,"y":0,"w":value,"h":100]) }
    }
    for key in ["fps","max_width","bitrate_mbps"] {
      for value:Any in [true,-1,1e100,Double.infinity,"30"] {
        rejected("malformed encoder settings") { _=try RecordSettings.from([key:value]) }
      }
    }
    for key in ["fps","max_width","limit","events","keyframe_images","seconds","timeout_s","from_s","to_s"] {
      for value:Any in [true,-1,1e100,"123"] {
        rejected("numeric request boundary") { try RPCNumber.validate("qualification",[key:value]) }
      }
    }
    rejected("frame list never silently discards malformed entry") { try RPCNumber.validate("record.frames",["at_s":[0,"1",2]]) }
    check(parseTime(1e100)==nil && parseTime(true)==nil,"invalid epoch time withheld")
    check(parseTime(1791486000) != nil,"normal numeric epoch accepted")

    let root=FileManager.default.temporaryDirectory.appendingPathComponent("input-test-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at:root) }
    let clock=TestClock(), ledger=ActionTimeline(root:root.path,clock:{clock.now()})
    let target:[String:Any]=["bundle_id":"com.test.Owned","pid":100,"window_id":10]
    func params(_ id:String="one") -> [String:Any] { ["session_id":"session","caller":"agent","provider":"native-cua","action_id":id,"intent":"open owned test menu","context":["verification_plan":"inspect menu pixels"],"timeout_s":1] }
    let begun=try ledger.begin(params(),target:target), token=begun.str("action_token")!
    check(begun.str("start_ns")=="9007199254740999","exact service clock beyond JS precision")
    check(begun.str("ownership")=="caller_claimed_unverified","service stamps never prove ownership")
    check(ledger.activeIDs(sessionID:"session",pid:100,windowID:10,at:clock.now())==[token],"active declared context associated")
    check(ledger.activeIDs(sessionID:"session",pid:101,windowID:10,at:clock.now()).isEmpty,"other app excluded")
    check(ledger.activeIDs(sessionID:"session",pid:100,windowID:11,at:clock.now()).isEmpty,"other window excluded")
    check(ledger.activeIDs(sessionID:"other",pid:100,windowID:10,at:clock.now()).isEmpty,"other session excluded")
    rejected("duplicate active action") { _=try ledger.begin(params(),target:target) }
    let file=root.appendingPathComponent(token+".json")
    let before=try Data(contentsOf:file)
    rejected("foreign caller cannot end") { _=try ledger.end(["session_id":"session","caller":"other","action_token":token,"result":"verified"]) }
    check(try Data(contentsOf:file)==before,"rejected close leaves persisted metadata unchanged")
    clock.advance(10)
    let end:[String:Any]=["session_id":"session","caller":"agent","action_token":token,"result":"verified","evidence_refs":["/private/synthetic.png"]]
    let closed=try ledger.end(end)
    check(closed.str("end_ns")==String(clock.now()) && closed.str("state")=="closed","service end stamp")
    check(ledger.activeIDs(sessionID:"session",pid:100,windowID:10,at:clock.now()-5)==[token],"queue delay retains recently closed interval association")
    check(ledger.activeIDs(sessionID:"session",pid:100,windowID:10,at:clock.now()+1).isEmpty,"closed scope cannot attribute later events")
    clock.advance(10)
    check(try ledger.end(end).str("end_ns")==closed.str("end_ns"),"idempotent end never expands scope")
    check((try FileManager.default.attributesOfItem(atPath:file.path)[.posixPermissions] as? NSNumber)?.intValue==0o600,"private action file")
    for field in ["timeout_s","extra"] {
      var bad=params("invalid"); bad[field]=field=="extra" ? 1 : 0
      rejected("invalid action field") { _=try ledger.begin(bad,target:target) }
    }
    for value:Any in [true,-1,1.5,Double.infinity,Double(UInt32.max)+1] {
      var bad=target; bad["window_id"]=value
      rejected("invalid numeric window") { _=try ledger.begin(params("bad-target"),target:bad) }
    }
    var badEnd=end; badEnd["evidence_refs"]=["/private/line\nbreak"]
    rejected("control characters in reference") { _=try ledger.end(badEnd) }
    let foreign=ActionTimeline(root:root.path,clock:{clock.now()})
    check((foreign.list(sessionID:"session",caller:"other")["actions"] as? [[String:Any]])?.isEmpty==true,"recovery list caller scoped")
    check((foreign.list(sessionID:"session",caller:"agent")["actions"] as? [[String:Any]])?.count==1,"terminal token discoverable after restart")
    let interrupted=try ledger.begin(params("restart"),target:target), restartToken=interrupted.str("action_token")!
    let list=foreign.list(sessionID:"session",caller:"agent")["actions"] as! [[String:Any]]
    check(list.first(where:{$0.str("action_token")==restartToken})?["end_ns"] is NSNull,"restart recovery does not invent end time")
    let restartFile=root.appendingPathComponent(restartToken+".json"), restartBefore=try Data(contentsOf:restartFile)
    rejected("foreign recovery cannot mutate") { _=try foreign.end(["session_id":"session","caller":"other","action_token":restartToken,"result":"unknown"]) }
    check(try Data(contentsOf:restartFile)==restartBefore,"restart foreign namespace checked before mutation")
    let recovered=try foreign.end(["session_id":"session","caller":"agent","action_token":restartToken,"result":"unknown"])
    check(recovered.str("state")=="interrupted" && recovered["end_ns"] is NSNull,"restarted active token settled as interrupted")
    let expiring=try foreign.begin(params("expiry"),target:target), expiryToken=expiring.str("action_token")!
    try await Task.sleep(nanoseconds:1_200_000_000)
    let expired=try foreign.end(["session_id":"session","caller":"agent","action_token":expiryToken,"result":"verified"])
    check(expired.str("state")=="expired" && expired.str("end_ns")==expiring.str("deadline_ns"),"scope deadline bounded independently of UI")
    check(expired.str("result")=="interrupted","late result cannot claim uninterrupted action")
    let raceLedger=ActionTimeline(root:root.appendingPathComponent("race").path,clock:{clock.now()})
    let race=try raceLedger.begin(params("concurrent"),target:target), raceToken=race.str("action_token")!
    let raceRows=try await withThrowingTaskGroup(of:String.self,returning:[String].self) { group in
      for _ in 0..<32 { group.addTask { try raceLedger.end(["session_id":"session","caller":"agent","action_token":raceToken,"result":"delivered"]).str("end_ns")! } }
      var values:[String]=[]; for try await value in group { values.append(value) }; return values
    }
    check(Set(raceRows).count==1,"concurrent close settles one immutable interval")
    let persistedRace=try JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent("race/"+raceToken+".json"))) as! [String:Any]
    check(persistedRace.str("state")=="closed","concurrent terminal publication persists")
    let failureRoot=root.appendingPathComponent("failure"), failureLedger=ActionTimeline(root:failureRoot.path,clock:{clock.now()})
    let failed=try failureLedger.begin(params("persist-retry"),target:target), failedToken=failed.str("action_token")!
    try FileManager.default.removeItem(at:failureRoot); try Data().write(to:failureRoot)
    let failedEnd:[String:Any]=["session_id":"session","caller":"agent","action_token":failedToken,"result":"delivered"]
    rejected("failed persistence remains explicit") { _=try failureLedger.end(failedEnd) }
    check((failureLedger.status["persistence_failures"] as? Int)==1,"persistence failure count observable")
    try FileManager.default.removeItem(at:failureRoot)
    let repaired=try failureLedger.end(failedEnd)
    check(repaired.str("state")=="closed" && FileManager.default.fileExists(atPath:failureRoot.appendingPathComponent(failedToken+".json").path),"idempotent retry repairs missing terminal publication without UI replay")

    let capacity=ActionTimeline(root:root.appendingPathComponent("capacity").path,clock:{clock.now()})
    for i in 0..<64 { _=try capacity.begin(params("cap-\(i)"),target:target) }
    rejected("active admission bound") { _=try capacity.begin(params("cap-65"),target:target) }
    print("{\"passed\":\(checks),\"scope\":\"mechanical input relevance and service-stamped action lifecycle; no UI or input synthesis\"}")
  }
}
