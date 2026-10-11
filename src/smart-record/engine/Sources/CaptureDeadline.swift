import Foundation

/// A shared asynchronous SDK operation with a deadline independent of whether
/// the SDK honors Task cancellation. Timed-out work stays observable until its
/// producer really finishes; callers must retain/quarantine it before retrying.
final class CaptureDeadline<Value>: @unchecked Sendable {
  private let lock = NSLock()
  private var outcome: Result<Value, Error>?
  private var finished = false
  private var tickets: [UUID: DeadlineTicket<Value>] = [:]
  private var worker: Task<Void, Never>?
  private var timer: DispatchWorkItem?
  let label: String

  init(seconds: Double, label: String, operation: @escaping @Sendable () async throws -> Value) {
    precondition(seconds > 0 && seconds.isFinite)
    self.label = label
    let timeout = DispatchWorkItem { [weak self] in self?.expire() }
    timer = timeout
    // Keep the producer alive until its actual completion, even when a caller
    // cancels. This is one worker, not one orphan Task per waiting request.
    let task = Task {
      let result: Result<Value, Error>
      do { result = .success(try await operation()) }
      catch { result = .failure(error) }
      self.complete(result)
    }
    lock.withLock {
      if !finished { worker = task }
    }
    DispatchQueue.global().asyncAfter(deadline: .now() + seconds, execute: timeout)
  }

  var producerFinished: Bool { lock.withLock { finished } }
  var timedOut: Bool {
    lock.withLock { if case .failure(let error) = outcome { return (error as? RPCError)?.code == "capture_timeout" }; return false }
  }
  var waiterCount: Int { lock.withLock { tickets.count } }

  func value() async throws -> Value {
    let ticket = DeadlineTicket<Value>()
    return try await withTaskCancellationHandler(operation: {
      try await withCheckedThrowingContinuation { continuation in
        ticket.install(continuation)
        let immediate: Result<Value, Error>? = lock.withLock {
          if let outcome { return outcome }
          if !ticket.resolved { tickets[ticket.id] = ticket }
          return nil
        }
        if let immediate { ticket.resolve(immediate) }
      }
    }, onCancel: {
      ticket.resolve(.failure(CancellationError()))
      self.lock.withLock { self.tickets[ticket.id] = nil }
    })
  }

  private func expire() {
    let waiting: [DeadlineTicket<Value>], task: Task<Void, Never>?
    (waiting, task) = lock.withLock {
      guard outcome == nil else { return ([], nil) }
      outcome = .failure(RPCError(code: "capture_timeout", message: "\(label) exceeded its capture deadline; unfinished SDK work is quarantined until it completes"))
      let all = Array(tickets.values); tickets.removeAll()
      return (all, worker)
    }
    task?.cancel()
    let error = RPCError(code: "capture_timeout", message: "\(label) exceeded its capture deadline; unfinished SDK work is quarantined until it completes")
    for ticket in waiting { ticket.resolve(.failure(error)) }
  }

  private func complete(_ result: Result<Value, Error>) {
    let waiting: [DeadlineTicket<Value>] = lock.withLock {
      finished = true
      worker = nil
      timer?.cancel(); timer = nil
      // A late SDK completion cannot turn an already timed-out request into a
      // success. Value cleanup belongs to the operation's owner.
      guard outcome == nil else { return [] }
      outcome = result
      let all = Array(tickets.values); tickets.removeAll()
      return all
    }
    for ticket in waiting { ticket.resolve(result) }
  }
}

private final class DeadlineTicket<Value>: @unchecked Sendable {
  let id = UUID()
  private let lock = NSLock()
  private var result: Result<Value, Error>?
  private var continuation: CheckedContinuation<Value, Error>?
  var resolved: Bool { lock.withLock { result != nil } }
  func install(_ value: CheckedContinuation<Value, Error>) {
    let immediate = lock.withLock { continuation = value; return result }
    if let immediate {
      lock.withLock { continuation = nil }
      value.resume(with: immediate)
    }
  }
  func resolve(_ value: Result<Value, Error>) {
    let pending: CheckedContinuation<Value, Error>? = lock.withLock {
      guard result == nil else { return nil }
      result = value
      let current = continuation; continuation = nil
      return current
    }
    pending?.resume(with: value)
  }
}
