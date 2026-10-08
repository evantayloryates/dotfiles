import Foundation

struct ExclusionAppIdentity: Hashable, Sendable {
  let pid: Int32
  let launch: String?
}

/// An observed identity transition is a quality interruption, not a precise
/// timestamp for the first leaked pixel. Observation may lag the process.
struct ExclusionIdentityChange: Sendable {
  let bundle: String
  let before: Set<ExclusionAppIdentity>
  let after: Set<ExclusionAppIdentity>
  let observedNS: UInt64
  var dict: [String: Any] {
    ["bundle_id":bundle,"old_pids":before.map{$0.pid}.sorted(),
     "new_pids":after.map{$0.pid}.sorted(),"observed_host_ns":String(observedNS),
     "first_affected_frame":"unknown; observation is not process/pixel onset",
     "qualification":"exclusion identity changed; inspect the take or reshoot"]
  }
}

final class ExclusionIdentityLease: @unchecked Sendable {
  let token=UUID()
  let expected:[String:Set<ExclusionAppIdentity>]
  private let lock=NSLock()
  private var first:ExclusionIdentityChange?
  let onChange:@Sendable (ExclusionIdentityChange)->Void
  init(expected:[String:Set<ExclusionAppIdentity>],onChange:@escaping @Sendable (ExclusionIdentityChange)->Void){self.expected=expected;self.onChange=onChange}
  var change:ExclusionIdentityChange? {lock.withLock{first}}
  func invalidate(_ change:ExclusionIdentityChange)->Bool {
    lock.withLock{guard first==nil else{return false};first=change;return true}
  }
  func validate() throws {
    if let change {throw RPCError(code:"exclusion_changed",message:"excluded app \(change.bundle) changed process identity during capture setup; resolve again before a new take")}
  }
  func validateResolved(_ resolved:[String:Set<Int32>]) throws {
    try validate()
    for (bundle,identities) in expected {
      guard resolved[bundle]==Set(identities.map{$0.pid}),!identities.isEmpty else {
        throw RPCError(code:"exclusion_changed",message:"excluded app \(bundle) resolution disagrees with the observed application identity; retry after it settles")
      }
    }
  }
}

/// Shared mechanical matching; never retains unrelated app history or calls
/// callbacks while locked. A lease remains invalid across a subsequent recovery.
final class ExclusionIdentityTracker: @unchecked Sendable {
  private let lock=NSLock()
  private var current:[String:Set<ExclusionAppIdentity>]? = nil
  private var leases:[UUID:ExclusionIdentityLease]=[:]
  private var observations=0,invalidations=0
  private var observedNS:UInt64=0
  func observe(_ apps:[String:Set<ExclusionAppIdentity>],at ns:UInt64) {
    let notices:[(ExclusionIdentityLease,ExclusionIdentityChange)]=lock.withLock {
      current=apps;observations+=1;observedNS=ns
      var notices:[(ExclusionIdentityLease,ExclusionIdentityChange)]=[]
      for lease in leases.values {
        for bundle in lease.expected.keys.sorted() {
          let before=lease.expected[bundle] ?? [],after=apps[bundle] ?? []
          guard before != after else{continue}
          let change=ExclusionIdentityChange(bundle:bundle,before:before,after:after,observedNS:ns)
          if lease.invalidate(change){invalidations+=1;notices.append((lease,change))}
          break
        }
      }
      return notices
    }
    for (lease,change) in notices {lease.onChange(change)}
  }
  func subscribe(_ bundles:[String],onChange:@escaping @Sendable (ExclusionIdentityChange)->Void) throws -> ExclusionIdentityLease {
    try lock.withLock {
      guard let current else{throw RPCError(code:"exclusion_unavailable",message:"application identity observation has not initialized")}
      guard leases.count<16 else{throw RPCError(code:"capture_busy",message:"exclusion observer already has 16 capture leases")}
      let requested=Set(bundles)
      guard !requested.isEmpty,requested.count<=8 else{throw RPCError.badParams("exclusion lease requires 1–8 bundles")}
      var expected:[String:Set<ExclusionAppIdentity>]=[:]
      for bundle in requested {
        guard let identities=current[bundle],!identities.isEmpty else{throw RPCError(code:"target_not_found",message:"excluded app \(bundle) is not running")}
        expected[bundle]=identities
      }
      let lease=ExclusionIdentityLease(expected:expected,onChange:onChange)
      leases[lease.token]=lease;return lease
    }
  }
  func unsubscribe(_ lease:ExclusionIdentityLease){_=lock.withLock{leases.removeValue(forKey:lease.token)}}
  var status:[String:Any] {lock.withLock{
    ["leases":leases.count,"initialized":current != nil,"observations":observations,
     "invalidations":invalidations,"last_observed_change_host_ns":String(observedNS),
     "policy":"interrupt take on observed identity change; no automatic filter replacement",
     "coverage":"main-run-loop observation can lag; first affected pixel is unknown"]
  }}
}
