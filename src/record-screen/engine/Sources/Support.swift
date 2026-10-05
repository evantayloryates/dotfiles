import Foundation

/// Monotonic host clock in nanoseconds. Same base as ScreenCaptureKit frame
/// timestamps and Hammerspoon's hs.timer.absoluteTime(), so agents can place
/// markers on recordings without calibration.
func uptimeNs() -> UInt64 { clock_gettime_nsec_np(CLOCK_UPTIME_RAW) }

private let timebase: mach_timebase_info_data_t = {
  var tb = mach_timebase_info_data_t()
  mach_timebase_info(&tb)
  return tb
}()

/// Mach absolute time (ScreenCaptureKit's displayTime) to uptimeNs() units.
func machToNs(_ t: UInt64) -> UInt64 { t * UInt64(timebase.numer) / UInt64(timebase.denom) }

let iso8601: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f
}()

struct Paths {
  let root: String
  var run: String { root + "/run" }
  var logs: String { root + "/logs" }
  var socket: String { run + "/engine.sock" }
  var lock: String { run + "/engine.lock" }
  var log: String { logs + "/engine.jsonl" }
  /// Loose verify images not tied to a session; pruned after a day.
  var frames: String { root + "/frames" }

  /// RECORD_SCREEN_HOME overrides ~/.record-screen (used by tests).
  static func resolve() -> Paths {
    if let h = ProcessInfo.processInfo.environment["RECORD_SCREEN_HOME"], !h.isEmpty { return Paths(root: h) }
    return Paths(root: NSHomeDirectory() + "/.record-screen")
  }

  func ensure() throws {
    for dir in [root, run, logs, frames] {
      try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    }
  }
}

/// Holds an exclusive flock for the life of the process, so a manually started
/// engine and the LaunchAgent's copy can never both own the socket.
final class InstanceLock {
  private let fd: Int32
  init?(path: String) {
    fd = open(path, O_CREAT | O_RDWR, 0o600)
    guard fd >= 0, flock(fd, LOCK_EX | LOCK_NB) == 0 else { return nil }
    ftruncate(fd, 0)
    let pid = "\(getpid())\n"
    _ = pid.withCString { write(fd, $0, strlen($0)) }
  }
}

/// Append-only JSON Lines log at ~/.record-screen/logs/engine.jsonl.
enum Log {
  private static var handle: FileHandle?
  private static let q = DispatchQueue(label: "record-screen.log")

  static func open(_ path: String) {
    if !FileManager.default.fileExists(atPath: path) {
      FileManager.default.createFile(atPath: path, contents: nil, attributes: [.posixPermissions: 0o600])
    }
    handle = FileHandle(forWritingAtPath: path)
    handle?.seekToEndOfFile()
  }

  static func event(_ name: String, _ fields: [String: Any] = [:]) {
    var row = fields
    row["event"] = name
    row["ts"] = iso8601.string(from: Date())
    row["clock_ns"] = uptimeNs()
    guard let data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) else { return }
    q.async {
      handle?.write(data)
      handle?.write(Data([0x0A]))
    }
  }
}

extension Dictionary where Key == String, Value == Any {
  func num(_ k: String) -> Double? { (self[k] as? NSNumber)?.doubleValue }
  func str(_ k: String) -> String? { self[k] as? String }
  func bool(_ k: String) -> Bool? { (self[k] as? NSNumber)?.boolValue }
}

struct RPCError: Error {
  let code: String
  let message: String
  static func badParams(_ m: String) -> RPCError { RPCError(code: "bad_params", message: m) }
}
