import Foundation

struct ListenerContextResult: Sendable {
  let listenAccess:Bool
  let foregroundPID:Int32
  let secureInput:Bool
  let tapEnabled:Bool
}
struct ListenerContextSnapshot: Sendable {
  let hostNS:UInt64
  let value:ListenerContextResult?
  var startedHostNS:UInt64=0
}

/// Workspace/TCC/tap reads can stall during a desktop failure too. One worker
/// retains its admission slot until it actually returns, across listener stops.
/// The listener's main run loop reads snapshots, never waits for this producer.
final class ListenerContextSampler: @unchecked Sendable {
  private let lock=NSLock()
  private let q=DispatchQueue(label:"record-screen.listener-context",qos:.utility)
  private let query:@Sendable ()->ListenerContextResult
  private let clock:@Sendable ()->UInt64
  var onGap:(@Sendable (String,UInt64)->Void)?
  private var active=false, pending=false, stalled=false
  private var generation:UInt64=0,pendingStart:UInt64=0
  private var current=ListenerContextSnapshot(hostNS:0,value:nil)
  private var count=0,ignoredLate=0
  private var totalNS:UInt64=0,maxNS:UInt64=0
  init(query:@escaping @Sendable ()->ListenerContextResult,clock:@escaping @Sendable ()->UInt64={uptimeNs()}) {
    self.query=query;self.clock=clock
  }
  func activate(){lock.withLock{active=true;generation &+= 1;current=ListenerContextSnapshot(hostNS:0,value:nil)}}
  func deactivate(){lock.withLock{active=false;generation &+= 1;current=ListenerContextSnapshot(hostNS:0,value:nil)}}
  var snapshot:ListenerContextSnapshot{lock.withLock{current}}
  var status:[String:Any]{lock.withLock{
    ["listener_context_active":active,"listener_context_refresh_in_flight":pending,
     "listener_context_snapshot_host_ns":String(current.hostNS),"listener_context_ignored_late_results":ignoredLate,
     "listener_context_snapshot_begin_host_ns":String(current.startedHostNS),
     "listener_context_refresh_count":count,"listener_context_refresh_max_ns":String(maxNS),
     "listener_context_refresh_average_ns":count>0 ? String(totalNS/UInt64(count)) : "0",
     "listener_context_work":"one utility-queue producer; snapshots may be stale during OS failure"]
  }}
  @discardableResult func refresh()->Bool {
    let now=clock();var report=false
    let ticket:UInt64?=lock.withLock{
      guard active else{return nil}
      if pending {
        if !stalled,now>=pendingStart,now-pendingStart>2_000_000_000{stalled=true;report=true}
        return nil
      }
      pending=true;pendingStart=now;stalled=false;return generation
    }
    if report{onGap?("listener_context_query_stalled",now)}
    guard let ticket else{return false}
    q.async{[self] in
      let start=clock(),value=query(),finish=clock()
      lock.withLock{
        pending=false;count+=1;let elapsed=finish>=start ? finish-start : 0;totalNS &+= elapsed;maxNS=max(maxNS,elapsed)
        guard active,generation==ticket else{ignoredLate+=1;return}
        current=ListenerContextSnapshot(hostNS:finish,value:value,startedHostNS:start)
      }
    }
    return true
  }
}
