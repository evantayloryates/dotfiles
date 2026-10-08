import Foundation

@main struct ManagedCommandTest {
  static func main() async throws {
    var checks = 0
    func check(_ value: Bool, _ message: String) {
      guard value else { fatalError(message) }; checks += 1
    }
    func idle() async throws {
      for _ in 0..<200 {
        if ManagedCommand.status()["pending"] as? Bool == false { return }
        try await Task.sleep(nanoseconds: 10_000_000)
      }
      fatalError("owned child failed to release admission after actual exit")
    }
    for _ in 0..<20 {
      let result = try await ManagedCommand.run("/bin/sh", ["-c", "printf hello; printf failure >&2; exit 7"], timeout: 2)
      check(result.status == 7, "actual exit status")
      check(String(data: result.stdout, encoding: .utf8) == "hello", "stdout drained before publication")
      check(String(data: result.stderr, encoding: .utf8) == "failure", "stderr drained before publication")
      check(ManagedCommand.status()["pending"] as? Bool == false, "short child releases slot")
    }
    do {
      _ = try await ManagedCommand.run("/bin/sh", ["-c", "i=0; while [ $i -lt 2000 ]; do printf 0123456789012345678901234567890123456789 >&2; i=$((i+1)); done"], timeout: 2, maxBytes: 1024)
      fatalError("output cap should be explicit")
    } catch let e as RPCError { check(e.code == "export_output_limit", "noisy pipe drains without a deadlock") }
    try await idle()
    let start = Date()
    let stalled = Task { try await ManagedCommand.run("/bin/sh", ["-c", "trap '' TERM; while :; do :; done"], timeout: 0.15) }
    for _ in 0..<100 {
      if ManagedCommand.status()["pending"] as? Bool == true { break }
      try await Task.sleep(nanoseconds: 1_000_000)
    }
    do {
      _ = try await ManagedCommand.run("/bin/echo", ["must-not-start"], timeout: 2)
      fatalError("concurrent child should refuse")
    } catch let e as RPCError { check(e.code == "export_busy", "concurrent admission refuses") }
    do { _ = try await stalled.value; fatalError("deadline must fail") }
    catch let e as RPCError { check(e.code == "export_timeout", "independent caller deadline") }
    check(Date().timeIntervalSince(start) < 0.5, "caller does not await uncooperative child")
    check(ManagedCommand.status()["quarantined"] as? Bool == true, "unfinished child retains admission")
    do {
      _ = try await ManagedCommand.run("/bin/echo", ["must-not-start"], timeout: 2)
      fatalError("quarantined child should refuse")
    } catch let e as RPCError { check(e.code == "export_busy", "timed-out work still counts") }
    try await idle()
    let recovery = try await ManagedCommand.run("/bin/echo", ["recovered"], timeout: 2)
    check(recovery.status == 0 && String(data: recovery.stdout, encoding: .utf8) == "recovered\n", "recovery after owned child exit")
    do { _ = try await ManagedCommand.run("/nonexistent/record-screen-test", [], timeout: 1); fatalError("invalid launch should fail") }
    catch { check(ManagedCommand.status()["pending"] as? Bool == false, "launch error releases admission") }
    print("{\"passed\":\(checks),\"scope\":\"owned subprocess drains, output cap, admission, deadline, retained quarantine and recovery; no capture or UI\"}")
  }
}
