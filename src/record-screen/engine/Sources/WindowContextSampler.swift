import Foundation

struct WindowContextResult: Sendable {
  var transientWindows: [Int32:Set<UInt32>] = [:]
  var gap: String? = nil
}
struct WindowContextSnapshot: Sendable {
  let hostNS: UInt64
  let transientWindows: [Int32:Set<UInt32>]
}

/// One utility-queue query shared by the listener, with unfinished work retaining
/// its slot across listener generations. Read-only window discovery can finish
/// late; it cannot populate the next listener's scope or grow a retry queue.
final class WindowContextSampler: @unchecked Sendable {
  private let lock=NSLock()
  private let q=DispatchQueue(label:"record-screen.window-context",qos:.utility)
  private let query: @Sendable () -> WindowContextResult
  private let clock: @Sendable () -> UInt64
  var onGap: (@Sendable (String,UInt64) -> Void)?
  private var active=false
  private var generation:UInt64=0
  private var pending=false
  private var pendingStart:UInt64=0
  private var stalled=false
  private var current=WindowContextSnapshot(hostNS:0,transientWindows:[:])
  private var count=0, ignoredLate=0
  private var totalNS:UInt64=0, maxNS:UInt64=0

  init(query:@escaping @Sendable () -> WindowContextResult, clock:@escaping @Sendable () -> UInt64 = {uptimeNs()}) {
    self.query=query;self.clock=clock
  }
  func activate() { lock.withLock { active=true;generation &+= 1;current=WindowContextSnapshot(hostNS:0,transientWindows:[:]) } }
  func deactivate() { lock.withLock { active=false;generation &+= 1;current=WindowContextSnapshot(hostNS:0,transientWindows:[:]) } }
  var snapshot:WindowContextSnapshot { lock.withLock { current } }
  var status:[String:Any] { lock.withLock {
    ["window_context_refresh_in_flight":pending,"window_context_snapshot_host_ns":String(current.hostNS),
     "window_refresh_count":count,"window_refresh_max_ns":String(maxNS),"window_refresh_average_ns":count>0 ? String(totalNS/UInt64(count)) : "0",
     "window_context_ignored_late_results":ignoredLate,"window_context_active":active,
     "window_context_work":"one utility-queue query at a time; no event-listener run-loop enumeration"]
  } }
  /// Returns admission, useful for both lifecycle callers and qualification.
  @discardableResult func refresh() -> Bool {
    let now=clock()
    var reportStall=false
    let ticket:UInt64?=lock.withLock {
      guard active else { return nil }
      if pending {
        if !stalled,now>=pendingStart,now-pendingStart>2_000_000_000 { stalled=true;reportStall=true }
        return nil
      }
      pending=true;pendingStart=now;stalled=false
      return generation
    }
    if reportStall { onGap?("window_context_query_stalled",now) }
    guard let ticket else { return false }
    q.async { [self] in
      let start=clock(),result=query(),finish=clock()
      let elapsed=finish>=start ? finish-start : 0
      let accepted=lock.withLock {
        pending=false;count+=1;totalNS &+= elapsed;maxNS=max(maxNS,elapsed)
        guard active,generation==ticket else { ignoredLate+=1;return false }
        current=WindowContextSnapshot(hostNS:finish,transientWindows:result.transientWindows)
        return true
      }
      if accepted,let reason=result.gap { onGap?(reason,finish) }
    }
    return true
  }
}
