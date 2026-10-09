import Foundation
import CoreGraphics

final class InputRows: @unchecked Sendable {
  let lock=NSLock();var rows:[[String:Any]]=[]
  let blocked=DispatchSemaphore(value:0),release=DispatchSemaphore(value:0)
  var shouldBlock=true
  func accept(_ row:[String:Any]) {
    let wait=lock.withLock {rows.append(row);if row["kind"] as? String == "input_event" && shouldBlock {shouldBlock=false;return true};return false}
    if wait {blocked.signal();_ = release.wait(timeout:.now()+10)}
  }
  var value:[[String:Any]] {lock.withLock{rows}}
  func waitUntilBlocked() async -> Bool {
    await withCheckedContinuation{c in DispatchQueue.global().async {c.resume(returning:self.blocked.wait(timeout:.now()+2) == .success)}}
  }
}
@main struct InputOverloadTest {
  static func main() async throws {
    var n=0
    func check(_ value:Bool,_ name:String){guard value else {fatalError(name)};n+=1}
    func barrier(_ listener:InputTimeline) async {await withCheckedContinuation{c in listener.qualificationBarrier{c.resume()}}}
    let output=CommandLine.arguments[1],epoch:UInt64=9_007_199_254_740_999
    try FileManager.default.createDirectory(atPath:output,withIntermediateDirectories:true)
    let journal=try SourceJournal(path:output+"/source.jsonl",epoch:epoch,recordingID:"authored-overload",target:[:],capacity:4096)
    let listener=InputTimeline(),rows=InputRows();listener.qualificationActivate()
    listener.subscribe(id:"owned",sessionID:nil,context:InteractionScopeContext(pid:100,windowID:10,frame:CGRect(x:0,y:0,width:100,height:100))){row in rows.accept(row);journal.offer(row)}
    await barrier(listener)
    var sample=InteractionSample(type:1,receivedNS:epoch,eventNS:epoch,destinationPID:100,sourcePID:300,windowUnderPointer:10,x:20,y:20,eventNumber:7)
    listener.qualificationReceive(sample)
    check(await rows.waitUntilBlocked(),"first callback blocked on actual scope queue")
    sample.type=6;sample.destinationPID=200;sample.windowUnderPointer=12;sample.x=500
    for i in 1...2047 {sample.receivedNS=epoch+UInt64(i);listener.qualificationReceive(sample)}
    check(listener.status["queued"] as? Int==2048,"in-flight event counts toward strict capacity")
    sample.type=5
    for i in 2048...4047 {sample.receivedNS=epoch+UInt64(i);listener.qualificationReceive(sample)}
    sample.type=2;sample.receivedNS=epoch+4048;listener.qualificationReceive(sample)
    check(listener.status["queued"] as? Int==2048,"overload never grows accepted queue")
    check(listener.status["queue_overflow"] as? Int==2001,"overflow includes missing release")
    rows.release.signal();await barrier(listener)
    check(listener.status["queued"] as? Int==0,"actual queue drained")
    check(rows.value.filter{$0["kind"] as? String=="input_gap"}.isEmpty,"loss not inserted ahead of older accepted samples")
    let lateRows=InputRows();lateRows.shouldBlock=false
    listener.subscribe(id:"late",sessionID:nil,context:InteractionScopeContext(pid:100,windowID:10,frame:CGRect(x:0,y:0,width:100,height:100))){lateRows.accept($0)}
    await barrier(listener)
    sample.type=6;sample.receivedNS=epoch+4049;listener.qualificationReceive(sample);await barrier(listener)
    let events=rows.value.filter{$0["kind"] as? String=="input_event"},gaps=rows.value.filter{$0["reason"] as? String=="queue_overflow"}
    check(events.count==2048,"post-loss outside drag excluded instead of inheriting dropped release")
    check(gaps.count==1,"one loss boundary after prior accepted callbacks")
    let gap=gaps[0]
    check(gap["events_skipped"] as? Int==2001,"exact loss delta")
    check(lateRows.value.filter{$0["kind"] as? String=="input_gap"}.isEmpty,"new subscription never inherits earlier overflow")
    check(gap["first_lost_callback_sequence"] as? String=="2049" && gap["last_lost_callback_sequence"] as? String=="4049","exact missing callback interval")
    check(gap["first_lost_received_host_ns"] as? String==String(epoch+2048) && gap["last_lost_received_host_ns"] as? String==String(epoch+4048),"receipt frontier exact beyond JS integer precision")
    check(gap["drag_contexts_invalidated"] as? Int==1,"missing release invalidates drag context")
    check(events.last?["callback_sequence"] as? String=="2048","accepted callback receipt order preserved")
    check(events.allSatisfy{$0["input_queue_overflow_total"] as? Int==0},"old accepted rows never borrow future overflow total")
    sample.type=5;sample.destinationPID=100;sample.windowUnderPointer=10;sample.x=20;sample.receivedNS=epoch+4050;listener.qualificationReceive(sample);await barrier(listener)
    check(rows.value.last?["callback_sequence"] as? String=="4051","fresh in-scope sample retained after gap")
    check(rows.value.last?["input_queue_overflow_total"] as? Int==2001,"new row carries observed cumulative loss")
    check(rows.value.last?["ownership"] as? String=="unknown","receipt sequence never claims actor")
    check(lateRows.value.last?["callback_sequence"] as? String=="4051","new scope keeps its own fresh event")
    await withCheckedContinuation{c in listener.unsubscribe(id:"late"){c.resume()}}
    check(lateRows.value.last?["queue_overflow_during_scope"] as? Int==0,"new scope end excludes historical loss")
    await withCheckedContinuation{c in listener.unsubscribe(id:"owned"){c.resume()}}
    let end=rows.value.last!
    check(end["retained"] as? Int==2049 && end["outside_scope_count"] as? Int==1,"scope counts distinct from lost unknown events")
    check(end["queue_overflow_during_scope"] as? Int==2001,"end scope retains total loss")
    journal.finish();let deadline=Date().addingTimeInterval(5)
    while journal.describe()["state"] as? String != "closed" && Date()<deadline {try await Task.sleep(nanoseconds:1_000_000)}
    let jd=journal.describe();check(jd["complete"] as? Bool==true && jd["rows_lost"] as? Int==0,"clean journal closure remains separate from input loss")
    check((jd["input_events_skipped_observed"] as? [String:Int])?["queue_overflow"]==2001,"descriptor reports missing input separately from journal rows")
    check((jd["latest_input_queue_loss"] as? [String:Any])?["last_lost_callback_sequence"] as? String=="4049","descriptor retains exact loss boundary")
    let tail=InputTimeline(),tailRows=InputRows();tail.qualificationActivate()
    tail.subscribe(id:"tail",sessionID:nil,context:InteractionScopeContext(pid:100,windowID:10,frame:CGRect(x:0,y:0,width:100,height:100))){tailRows.accept($0)}
    await barrier(tail);sample.type=1;sample.eventNumber=8;sample.receivedNS=epoch+5000;tail.qualificationReceive(sample)
    check(await tailRows.waitUntilBlocked(),"tail queue controlled")
    sample.type=5
    for i in 1...2047 {sample.receivedNS=epoch+5000+UInt64(i);tail.qualificationReceive(sample)}
    sample.type=2;sample.receivedNS=epoch+7048;tail.qualificationReceive(sample)
    tailRows.release.signal();await barrier(tail)
    await withCheckedContinuation{c in tail.unsubscribe(id:"tail"){c.resume()}}
    let tr=tailRows.value;check(tr[tr.count-2]["reason"] as? String=="queue_overflow" && tr.last?["kind"] as? String=="input_scope_end","tail gap before terminal summary")
    check(tr[tr.count-2]["events_skipped"] as? Int==1,"tail loss visible without another callback")
    var bounded=InputQueueLoss();for i in 0..<40 {bounded.append(sequence:UInt64(i+1),host:epoch+UInt64(i),type:UInt32(i))}
    check(bounded.types.count==32 && bounded.typesUncounted==8 && bounded.count==40,"type aggregation bounded with explicit unrepresented count")
    check(JSONSerialization.isValidJSONObject(bounded.row),"loss metadata serializes")
    let result:[String:Any]=["passed":n,"accepted_first_scope":2049,"input_callbacks_lost":2001,"journal_rows_lost":0,"tail_callbacks_lost":1,
      "scope":"Actual input/scoping queues, authored scalar samples; no CGEvent creation, OS listener, input posting, UI or physical provider-rate guarantee"]
    try JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:output+"/proof.json"))
    print(String(data:try JSONSerialization.data(withJSONObject:result),encoding:.utf8)!)
  }
}
