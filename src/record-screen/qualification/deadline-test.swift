import Foundation

final class ControlledProducer: @unchecked Sendable {
  let lock = NSLock()
  var continuation: CheckedContinuation<Int, Error>?
  var calls = 0
  func operation() async throws -> Int {
    lock.withLock { calls += 1 }
    return try await withCheckedThrowingContinuation { value in lock.withLock { continuation = value } }
  }
  var ready: Bool { lock.withLock { continuation != nil } }
  func complete(_ value: Int) {
    let pending = lock.withLock { let pending = continuation; continuation = nil; return pending }
    pending?.resume(returning: value)
  }
}

@main struct DeadlineTest {
  static func main() async throws {
    var checks = 0
    func check(_ value: Bool, _ name: String) { guard value else { fatalError(name) }; checks += 1 }
    func wait(_ condition: () -> Bool) async {
      for _ in 0..<200 { if condition() { return }; try? await Task.sleep(nanoseconds: 1_000_000) }
      fatalError("condition deadline")
    }
    let producer = ControlledProducer()
    let shared = CaptureDeadline(seconds: 1, label: "shared fixture") { try await producer.operation() }
    let readers = (0..<20).map { _ in Task { try await shared.value() } }
    await wait { shared.waiterCount == 20 && producer.ready }
    check(producer.calls == 1, "one producer for many readers")
    producer.complete(42)
    for reader in readers { check(try await reader.value == 42, "shared result") }
    check(shared.producerFinished && shared.waiterCount == 0, "shared completion cleaned up")

    let stalled = ControlledProducer()
    let timed = CaptureDeadline(seconds: 0.05, label: "uncooperative SDK fixture") { try await stalled.operation() }
    await wait { stalled.ready }
    let started = Date()
    do { _ = try await timed.value(); fatalError("deadline should fail") }
    catch { check((error as? RPCError)?.code == "capture_timeout", "typed timeout") }
    check(Date().timeIntervalSince(started) < 0.3, "deadline does not await cancellation")
    check(timed.timedOut && !timed.producerFinished && timed.waiterCount == 0, "unfinished SDK remains observable")
    for _ in 0..<20 {
      do { _ = try await timed.value(); fatalError("quarantined work cannot become success") }
      catch { check((error as? RPCError)?.code == "capture_timeout", "fail fast while quarantined") }
    }
    check(stalled.calls == 1, "no new producer per retry")
    stalled.complete(99)
    await wait { timed.producerFinished }
    do { _ = try await timed.value(); fatalError("late result must not resurrect timeout") }
    catch { check((error as? RPCError)?.code == "capture_timeout", "late completion ignored") }

    let cancelProducer = ControlledProducer()
    let cancellable = CaptureDeadline(seconds: 1, label: "cancel fixture") { try await cancelProducer.operation() }
    let reader = Task { try await cancellable.value() }
    await wait { cancellable.waiterCount == 1 }
    reader.cancel()
    do { _ = try await reader.value; fatalError("cancel must fail") }
    catch { check(error is CancellationError, "caller cancellation") }
    check(cancellable.waiterCount == 0 && !cancellable.producerFinished, "cancel removes waiter only")
    cancelProducer.complete(7)
    check(try await cancellable.value() == 7, "other callers retain shared operation")
    print("{\"passed\":\(checks),\"scope\":\"deadline, shared producer, uncooperative completion, caller cancellation\"}")
  }
}
