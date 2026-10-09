import Foundation

@main struct PreviewExclusionTest {
  static func main() throws {
    var checks = 0
    func check(_ value: Bool, _ name: String) { guard value else { fatalError(name) }; checks += 1 }
    func rejects(_ operation: () throws -> Void, _ code: String) {
      do { try operation(); fatalError("expected \(code)") }
      catch let error as RPCError { check(error.code == code, "wrong refusal: \(error.code)") }
      catch { fatalError("unexpected error: \(error)") }
    }
    let tracker = ExclusionIdentityTracker()
    let old = ExclusionAppIdentity(pid: 11, launch: "1"), new = ExclusionAppIdentity(pid: 12, launch: "2")
    tracker.observe(["test.Helper": [old]], at: 1)
    rejects({ _ = try PreviewExclusion(tracker: tracker, bundles: ["test.Helper"], resolved: ["test.Helper": [12]], onChange: { _ in }) }, "exclusion_changed")
    check(tracker.status["leases"] as? Int == 0, "stale setup releases capacity")
    var callbacks = 0
    let counterLock = NSLock()
    let lane = try PreviewExclusion(tracker: tracker, bundles: ["test.Helper"], resolved: ["test.Helper": [11]], onChange: { _ in counterLock.withLock { callbacks += 1 } })
    let request = try tracker.subscribe(["test.Helper"], onChange: { _ in })
    check(tracker.status["leases"] as? Int == 2, "request and persistent lane coexist")
    tracker.observe(["test.Helper": [old], "unrelated.App": [new]], at: 2)
    try lane.validate(); try request.validate(); checks += 2
    tracker.observe(["test.Helper": [new]], at: 3)
    check(callbacks == 1, "lane invalidates once")
    rejects({ try lane.validate() }, "exclusion_changed")
    rejects({ try request.validate() }, "exclusion_changed")
    tracker.observe(["test.Helper": [old]], at: 4)
    check(callbacks == 1, "returning PID cannot revive a stale stream")
    lane.release(); lane.release(); tracker.unsubscribe(request)
    rejects({ try lane.validate() }, "capture_interrupted")
    check(tracker.status["leases"] as? Int == 0, "retirement and delivery release both leases")
    tracker.observe(["test.Helper": [new]], at: 5)
    var fresh: PreviewExclusion? = try PreviewExclusion(tracker: tracker, bundles: ["test.Helper"], resolved: ["test.Helper": [12]], onChange: { _ in })
    try fresh?.validate(); checks += 1
    fresh = nil
    check(tracker.status["leases"] as? Int == 0, "deinit releases an abandoned lane")
    rejects({ _ = try PreviewExclusion(tracker: tracker, bundles: ["missing.Helper"], resolved: [:], onChange: { _ in }) }, "target_not_found")
    check(tracker.status["leases"] as? Int == 0, "missing app does not leak capacity")
    print("{\"passed\":\(checks),\"scope\":\"preview lease setup, invalidation, stale delivery refusal, independent request lifetime and retirement; no SDK capture\"}")
  }
}
