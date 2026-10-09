import Foundation

/// Fences engine RPC admissions, not human input. A lease is provisional while
/// the owner checks existing jobs. Expiry reopens admission; no restart/replay.
final class MaintenanceFence: @unchecked Sendable {
  private struct Lease {
    let token:String
    let expires:UInt64
    var ready=false
    var committed=false
  }
  private let lock=NSLock()
  private let clock: @Sendable () -> UInt64
  init(clock:@escaping @Sendable ()->UInt64 = {clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)}){self.clock=clock}
  private var loaded=false
  private var operations=0
  private var lease:Lease?
  private static let reads:Set<String>=["ping","status","record.get","record.list","record.source","record.export_info","record.wait","session.get","session.search","action.list","maintenance.status","maintenance.acquire","maintenance.release","maintenance.validate","maintenance.restart"]
  func didLoad(){lock.withLock {loaded=true}}
  private func expire(_ now:UInt64){if let value=lease,!value.committed && value.expires<=now {lease=nil}}
  func enter(_ method:String) throws -> Bool {
    guard !Self.reads.contains(method) else{return false}
    return try lock.withLock {
      expire(clock())
      guard loaded else{throw RPCError(code:"engine_loading",message:"saved recording/session history is still loading; no new engine work was started")}
      guard lease==nil else{throw RPCError(code:"maintenance_busy",message:"idle maintenance has reserved new engine work; retry after release/expiry; no action was started")}
      operations+=1;return true
    }
  }
  func leave(){lock.withLock {operations-=1}}
  func reserve(seconds:Double) throws -> String {
    guard seconds.isFinite,seconds>=5,seconds<=180 else{throw RPCError.badParams("maintenance lease must be 5–180 seconds")}
    return try lock.withLock {
      let now=clock();expire(now)
      guard loaded,operations==0,lease==nil else{throw RPCError(code:"maintenance_busy",message:"engine loading, admitted work or another maintenance lease prevents idle maintenance")}
      let token=UUID().uuidString
      lease=Lease(token:token,expires:now+UInt64(seconds*1e9));return token
    }
  }
  func prepare(_ token:String,blockers:[String]) throws {
    try lock.withLock {
      expire(clock())
      guard var value=lease,value.token==token else{throw RPCError(code:"maintenance_expired",message:"maintenance lease expired or belongs to another caller")}
      guard blockers.isEmpty else{lease=nil;throw RPCError(code:"maintenance_busy",message:"idle maintenance blocked: \(blockers.joined(separator:", "))")}
      value.ready=true;lease=value
    }
  }
  func validate(_ token:String) throws {
    try lock.withLock {
      expire(clock())
      guard let value=lease,value.token==token,value.ready,!value.committed else{throw RPCError(code:"maintenance_expired",message:"ready maintenance token is missing, expired or already committed")}
    }
  }
  func commitRestart(_ token:String) throws {
    try lock.withLock {
      expire(clock())
      guard var value=lease,value.token==token,value.ready,!value.committed else{throw RPCError(code:"maintenance_expired",message:"ready maintenance token is missing, expired or already committed")}
      value.committed=true;lease=value
    }
  }
  func release(_ token:String) throws {
    try lock.withLock {
      expire(clock())
      guard let value=lease,value.token==token,!value.committed else{throw RPCError(code:"maintenance_expired",message:"maintenance lease expired, committed or belongs to another caller")}
      lease=nil
    }
  }
  var status:[String:Any] {lock.withLock {
    expire(clock())
    return ["loading":!loaded,"admitted_operations":operations,"reserved":lease != nil,"ready":lease?.ready ?? false,"restart_committed":lease?.committed ?? false,
      "clock_domain":"CLOCK_MONOTONIC_RAW",
      "expires_ns":lease.map {String($0.expires)} as Any? ?? NSNull(),
      "qualification":"engine RPC admissions only; not input locking, cross-service isolation or an automatic restart"]
  } }
}
