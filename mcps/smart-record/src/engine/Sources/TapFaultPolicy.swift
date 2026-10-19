import Foundation

/// Pure lifecycle policy, serialized with listener status. Permission comes
/// from the retained background context producer, never a tap callback query.
struct TapFaultPolicy {
  private(set) var state = "inactive"
  private(set) var generation: UInt64 = 0
  private(set) var attempts = 0
  private(set) var faults = 0
  private(set) var faultHostNS: UInt64 = 0
  private(set) var reason: String?
  static let limit = 3
  var acceptsEvents: Bool { state == "listening" || state == "listening_after_timeout" }
  var blocksRestart: Bool { ["disabled_by_user_input","timeout_recovery_exhausted","recovery_failed","access_revoked"].contains(state) }
  mutating func activate() {
    generation &+= 1; attempts=0; faultHostNS=0; reason=nil; state="listening"
  }
  mutating func stop() { generation &+= 1; state="inactive" }
  mutating func revokeAccess() { generation &+= 1; state="access_revoked"; reason="listen_access_revoked" }
  /// False means a late notification cannot replace a terminal/inactive state.
  mutating func disable(userInput: Bool, at hostNS: UInt64) -> Bool {
    guard state != "inactive", !blocksRestart else { return false }
    generation &+= 1; faults += 1; faultHostNS=hostNS
    reason=userInput ? "tap_disabled_by_user_input" : "tap_timeout"
    state=userInput ? "disabled_by_user_input" :
      (attempts < Self.limit ? "waiting_permission" : "timeout_recovery_exhausted")
    return true
  }
  mutating func beginRecovery(access: Bool, observedBeginNS: UInt64, now: UInt64) -> UInt64? {
    guard state == "waiting_permission", access, observedBeginNS >= faultHostNS,
          now >= observedBeginNS, now-observedBeginNS <= 2_000_000_000 else { return nil }
    attempts += 1; state="recovery_dispatched"
    return generation
  }
  @discardableResult mutating func completeRecovery(ticket: UInt64, enabled: Bool) -> Bool {
    guard generation == ticket, state == "recovery_dispatched" else { return false }
    state=enabled ? "listening_after_timeout" : "recovery_failed"
    return true
  }
  var dict: [String:Any] {
    ["state":state,"generation":String(generation),"timeout_attempts":attempts,"timeout_limit":Self.limit,
     "faults_observed":faults,"last_fault_host_ns":String(faultHostNS),"last_reason":reason as Any? ?? NSNull(),
     "accepts_events":acceptsEvents,"automatic_restart_blocked":blocksRestart,
     "policy":"timeout recovery requires a fresh background permission observation; user disable is never automatically recovered"]
  }
}
