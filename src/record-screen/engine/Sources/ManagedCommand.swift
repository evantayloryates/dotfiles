import Foundation
import Darwin

/// One owned child at a time. A deadline settles the caller, not admission:
/// unfinished launch/exit work keeps its slot until the actual producer exits.
final class ManagedCommand: @unchecked Sendable {
  struct Output { let stdout: Data; let stderr: Data; let status: Int32 }
  private static let gate = NSLock()
  private static var active: ManagedCommand?
  private let lock = NSLock()
  private let process = Process()
  private var waiter: CheckedContinuation<Output, Error>?
  private var settled = false
  private var timedOut = false
  private var output = Data(), errors = Data()
  private var overflow = false
  private let maxBytes: Int
  private let stdoutPipe = Pipe(), stderrPipe = Pipe()

  private init(maxBytes: Int) { self.maxBytes = maxBytes }

  static func status() -> [String: Any] {
    gate.withLock {
      guard let a = active else { return ["pending": false, "quarantined": false] }
      return a.lock.withLock { ["pending": true, "quarantined": a.timedOut] }
    }
  }

  static func run(_ executable: String, _ args: [String], timeout: Double = 120,
                  maxBytes: Int = 8 * 1024 * 1024) async throws -> Output {
    let job = ManagedCommand(maxBytes: maxBytes)
    try gate.withLock {
      guard active == nil else { throw RPCError(code: "export_busy", message: "an export/probe child still owns its admission slot") }
      active = job
    }
    return try await withCheckedThrowingContinuation { continuation in
      job.waiter = continuation
      DispatchQueue.global(qos: .utility).async { job.launch(executable, args) }
      DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak job] in job?.deadline() }
    }
  }

  private func append(_ data: Data, error: Bool) {
    lock.withLock {
      // Keep reading after the cap, otherwise a full pipe can block exit.
      let remaining = max(0, maxBytes - output.count - errors.count)
      if data.count > remaining { overflow = true }
      if error { errors.append(data.prefix(remaining)) } else { output.append(data.prefix(remaining)) }
    }
  }

  private func launch(_ executable: String, _ args: [String]) {
    // Read pipes concurrently to EOF; exit waits for drains before publication.
    let drains = DispatchGroup()
    drains.enter() // launch barrier: a very short child can exit before readers start
    defer { drains.leave() }
    process.executableURL = URL(fileURLWithPath: executable); process.arguments = args
    process.standardInput = FileHandle.nullDevice
    process.standardOutput = stdoutPipe; process.standardError = stderrPipe
    process.terminationHandler = { [self] p in
      drains.notify(queue: .global(qos: .utility)) { self.finish(status: p.terminationStatus) }
    }
    do {
      let shouldLaunch = lock.withLock { !timedOut }
      guard shouldLaunch else { finish(error: RPCError(code: "export_timeout", message: "export launch exceeded its deadline")); return }
      try process.run()
      for (pipe, isError) in [(stdoutPipe, false), (stderrPipe, true)] {
        drains.enter()
        DispatchQueue.global(qos: .utility).async { [self] in
          defer { drains.leave() }
          while let data = try? pipe.fileHandleForReading.read(upToCount: 16384), !data.isEmpty {
            append(data, error: isError)
          }
          try? pipe.fileHandleForReading.close()
        }
      }
      try? stdoutPipe.fileHandleForWriting.close(); try? stderrPipe.fileHandleForWriting.close()
      if lock.withLock({ timedOut }) { stop() }
    } catch {
      try? stdoutPipe.fileHandleForWriting.close(); try? stderrPipe.fileHandleForWriting.close()
      finish(error: error)
    }
  }

  private func stop() {
    if process.isRunning { process.terminate() }
    DispatchQueue.global().asyncAfter(deadline: .now() + 0.5) { [weak self] in
      guard let self else { return }
      if process.isRunning { _ = Darwin.kill(process.processIdentifier, SIGKILL) }
    }
  }

  private func deadline() {
    let continuation: CheckedContinuation<Output, Error>? = lock.withLock {
      guard !settled else { return nil }
      settled = true; timedOut = true
      let k = waiter; waiter = nil; return k
    }
    guard let continuation else { return }
    continuation.resume(throwing: RPCError(code: "export_timeout", message: "export/probe exceeded its deadline; unfinished child retains admission until exit"))
    stop()
  }

  private func finish(status: Int32 = -1, error: Error? = nil) {
    // Break the Process -> termination handler -> job cycle after actual exit
    // (or launch failure); otherwise every finished export retains its buffers.
    process.terminationHandler = nil
    for pipe in [stdoutPipe, stderrPipe] {
      try? pipe.fileHandleForReading.close(); try? pipe.fileHandleForWriting.close()
    }
    let result: (CheckedContinuation<Output, Error>?, Error?, Output) = lock.withLock {
      let k = settled ? nil : waiter
      settled = true; waiter = nil
      return (k, error ?? (overflow ? RPCError(code: "export_output_limit", message: "export/probe output exceeded its bounded buffer") : nil),
              Output(stdout: output, stderr: errors, status: status))
    }
    Self.gate.withLock { if Self.active === self { Self.active = nil } }
    if let k = result.0 { if let e = result.1 { k.resume(throwing: e) } else { k.resume(returning: result.2) } }
  }
}
