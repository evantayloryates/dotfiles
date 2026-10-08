import Foundation

final class QueryGate: @unchecked Sendable {
  let entered=DispatchSemaphore(value:0), release=DispatchSemaphore(value:0)
  let lock=NSLock();var calls=0;var ns:UInt64=10
  func now()->UInt64 { lock.withLock {ns} }
  func advance(_ value:UInt64) { lock.withLock { ns+=value } }
  func run()->WindowContextResult {
    let i=lock.withLock { calls+=1;return calls }
    if i==1 { entered.signal();release.wait() }
    return WindowContextResult(transientWindows:[100:[UInt32(i)]])
  }
}
final class GapLog: @unchecked Sendable {
  let lock=NSLock();var items:[String]=[]
  func append(_ reason:String) { lock.withLock { items.append(reason) } }
  var reasons:[String] {lock.withLock {items}}
}
@main struct WindowContextTest {
 static func main() throws {
  var checks=0
  func check(_ value:Bool,_ name:String) {guard value else {fatalError(name)};checks+=1}
  func awaitIdle(_ sampler:WindowContextSampler) {
    for _ in 0..<1000 {if sampler.status["window_context_refresh_in_flight"] as? Bool==false {return};Thread.sleep(forTimeInterval:0.001)}
    fatalError("query did not drain")
  }
  let gate=QueryGate(),gaps=GapLog()
  let sampler=WindowContextSampler(query:{gate.run()},clock:{gate.now()})
  sampler.onGap={reason,_ in gaps.append(reason)}
  check(!sampler.refresh(),"inactive has no work")
  sampler.activate();check(sampler.refresh(),"one producer admitted")
  check(gate.entered.wait(timeout:.now()+1) == .success,"query held away from caller")
  for _ in 0..<100 {check(!sampler.refresh(),"unfinished work never queues duplicate")}
  gate.advance(2_000_000_001)
  check(!sampler.refresh(),"deadline does not fake producer cancellation")
  _=sampler.refresh();check(gaps.reasons==["window_context_query_stalled"],"one explicit stall gap per query")
  sampler.deactivate();sampler.activate()
  check(!sampler.refresh(),"old work retains slot across generations")
  gate.release.signal();awaitIdle(sampler)
  check(sampler.snapshot.hostNS==0 && sampler.snapshot.transientWindows.isEmpty,"late old result cannot enter new scope")
  check(sampler.status["window_context_ignored_late_results"] as? Int==1,"ignored late result counted")
  check(sampler.refresh(),"new generation can recover after actual completion")
  awaitIdle(sampler)
  check(sampler.snapshot.transientWindows[100]==[2],"new query populates current scope")
  sampler.deactivate();check(sampler.snapshot.hostNS==0,"stop clears window context")
  check(!sampler.refresh(),"stop prevents new discovery")
  let unavailable=WindowContextSampler(query:{WindowContextResult(gap:"window_context_unavailable")})
  unavailable.onGap={reason,_ in gaps.append(reason)};unavailable.activate();_ = unavailable.refresh();awaitIdle(unavailable)
  check(gaps.reasons.contains("window_context_unavailable"),"unavailable context is explicit")
  print("{\"passed\":\(checks),\"scope\":\"single background query, blocked producer, one stall gap, late generation rejection and recovery; no Quartz/UI\"}")
 }
}
