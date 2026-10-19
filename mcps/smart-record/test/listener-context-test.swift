import Foundation

final class ListenerQueryGate:@unchecked Sendable {
  let entered=DispatchSemaphore(value:0),release=DispatchSemaphore(value:0)
  let lock=NSLock();var calls=0;var ns:UInt64=10
  func now()->UInt64{lock.withLock{ns}}
  func advance(_ v:UInt64){lock.withLock{ns+=v}}
  func run()->ListenerContextResult {
    let i=lock.withLock{calls+=1;return calls}
    if i==1{entered.signal();release.wait()}
    return ListenerContextResult(listenAccess:i==2,foregroundPID:Int32(i),secureInput:i==1,tapEnabled:i==2)
  }
}
@main struct ListenerContextTest {
  static func main() {
    var n=0
    func check(_ v:Bool,_ label:String){guard v else{fatalError(label)};n+=1}
    func drain(_ sampler:ListenerContextSampler){for _ in 0..<1000{if sampler.status["listener_context_refresh_in_flight"] as? Bool==false{return};Thread.sleep(forTimeInterval:0.001)};fatalError("producer did not drain")}
    let gate=ListenerQueryGate();let gaps=NSLock();nonisolated(unsafe) var reasons:[String]=[]
    let sampler=ListenerContextSampler(query:{gate.run()},clock:{gate.now()})
    sampler.onGap={reason,_ in gaps.withLock{reasons.append(reason)}}
    check(sampler.snapshot.value==nil,"unknown before sampled, not false access")
    check(!sampler.refresh(),"inactive cannot queue work")
    sampler.activate();check(sampler.refresh(),"admit one worker")
    check(gate.entered.wait(timeout:.now()+1) == .success,"caller returns while producer held")
    for _ in 0..<100{check(!sampler.refresh(),"stalled producer retains bounded slot")}
    gate.advance(2_000_000_001);_=sampler.refresh();_=sampler.refresh()
    check(gaps.withLock{reasons}==["listener_context_query_stalled"],"one explicit gap per producer")
    check(sampler.snapshot.value==nil,"stall cannot manufacture context")
    sampler.deactivate();sampler.activate();check(!sampler.refresh(),"unfinished work retained across generations")
    gate.release.signal();drain(sampler)
    check(sampler.snapshot.value==nil,"old secure/access snapshot cannot enter new generation")
    check(sampler.status["listener_context_ignored_late_results"] as? Int==1,"late result counted")
    check(sampler.refresh(),"recovery after real completion");drain(sampler)
    check(sampler.snapshot.value?.foregroundPID==2 && sampler.snapshot.value?.listenAccess==true && sampler.snapshot.value?.secureInput==false && sampler.snapshot.value?.tapEnabled==true,"fresh complete context is published")
    check(sampler.snapshot.startedHostNS>0 && sampler.snapshot.startedHostNS<=sampler.snapshot.hostNS,"query observation interval preserves conservative age")
    sampler.deactivate();check(sampler.snapshot.value==nil && sampler.snapshot.hostNS==0,"stop clears context")
    print("{\"passed\":\(n),\"scope\":\"blocked listener-context producer, bounded admission, stale generation rejection, access/secure/focus recovery; no OS/UI\"}")
  }
}
