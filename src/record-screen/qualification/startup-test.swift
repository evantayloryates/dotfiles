import Foundation

/// This gate always throws before target discovery: no SDK capture or UI.
final class StartupGate: @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: CheckedContinuation<Void, Error>?
  var ready: Bool { lock.withLock { continuation != nil } }
  func wait() async throws {
    try await withCheckedThrowingContinuation { value in lock.withLock { continuation = value } }
  }
  func fail() {
    let pending = lock.withLock { let current = continuation; continuation = nil; return current }
    pending?.resume(throwing: RPCError(code: "qualification_fault", message: "synthetic late startup failure"))
  }
}
final class RestartCounter: @unchecked Sendable {
  let lock = NSLock()
  private var count = 0
  func increment() { lock.withLock { count += 1 } }
  var value: Int { lock.withLock { count } }
}

@main struct StartupTest {
  static func main() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("record-startup-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let restarts = RestartCounter()
    Recording.onEncoderStall = { restarts.increment() }
    defer { Recording.onEncoderStall = nil }
    var checks = 0
    func check(_ ok: Bool, _ name: String) { guard ok else { fatalError(name) }; checks += 1 }
    func wait(_ condition: () -> Bool) async {
      for _ in 0..<1000 { if condition() { return }; try? await Task.sleep(nanoseconds: 1_000_000) }
      fatalError("condition deadline")
    }
    func recording(_ id: String, _ gate: StartupGate, budget: Double = 0.3) throws -> Recording {
      let now = Date()
      return Recording(id: id, dir: root.appendingPathComponent(id).path, target: ["type":"display"],
        settings: try RecordSettings.from([:]), label: "synthetic", startAt: now, endAt: now.addingTimeInterval(2),
        ifLate: "start", idempotencyKey: nil, sessionID: nil, startupPreflight: { try await gate.wait() }, startupBudgetSeconds: budget)
    }
    func persisted(_ recording: Recording) -> [String: Any] {
      guard let data = FileManager.default.contents(atPath: recording.manifestPath), let value = try? JSONSerialization.jsonObject(with: data) as? [String:Any] else { fatalError("manifest unavailable") }
      return value
    }
    let cancelGate = StartupGate(), canceled = try recording("cancel", cancelGate)
    canceled.schedule()
    await wait { cancelGate.ready && canceled.state == .arming }
    canceled.cancel()
    await wait { canceled.state == .canceled }
    check(canceled.captureQuarantined, "unfinished canceled startup retains admission")
    cancelGate.fail()
    await wait { !canceled.captureQuarantined }
    check(canceled.state == .canceled, "late error cannot resurrect canceled take")
    await wait { persisted(canceled)["capture_quarantined"] as? Bool == false }
    check(persisted(canceled)["state"] as? String == "canceled", "canceled state persisted")

    let stopGate = StartupGate(), stopped = try recording("stop", stopGate)
    stopped.schedule()
    await wait { stopGate.ready }
    stopped.stop()
    await wait { stopped.state == .canceled }
    check(stopped.captureQuarantined, "stopped startup remains visible")
    stopGate.fail()
    await wait { !stopped.captureQuarantined }
    check(stopped.state == .canceled, "late failure cannot replace stop result")

    let stallGate = StartupGate(), stalled = try recording("stall", stallGate, budget: 0.06)
    stalled.schedule()
    await wait { stallGate.ready }
    await wait { stalled.state == .failed }
    check(stalled.captureQuarantined, "watchdog leaves unfinished work admitted")
    check(stalled.describe()["error"] as? String == "capture did not start within 0.06 s of start_at; unfinished startup retains its admission slot", "watchdog reason")
    check(restarts.value == 0, "SDK startup deadline does not restart unrelated captures")
    stallGate.fail()
    await wait { !stalled.captureQuarantined }
    check(stalled.state == .failed, "late failure cannot overwrite deadline state")
    check((stalled.describe()["error"] as? String)?.contains("retains its admission slot") == true, "deadline cause survives late failure")
    await wait { persisted(stalled)["capture_quarantined"] as? Bool == false }
    check(persisted(stalled)["state"] as? String == "failed", "deadline recovery persisted")
    check(restarts.value == 0, "no encoder-stall callback in synthetic SDK failures")
    print("{\"passed\":\(checks),\"scope\":\"actual recording scheduling, cancellation, watchdog and late preflight failures; no target discovery/capture\"}")
  }
}
