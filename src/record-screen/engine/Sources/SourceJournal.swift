import Foundation
import AVFoundation
import ScreenCaptureKit

/// A bounded, asynchronous source ledger. No pixels, typed text or unrelated
/// desktop events are retained. An incomplete ledger never means a failed take.
final class SourceJournal: @unchecked Sendable {
  let path: String
  let epoch: UInt64
  private let lock = NSLock()
  private let io = DispatchQueue(label: "record-screen.source-journal", qos: .utility)
  private let capacity: Int
  private let byteLimit: Int
  private let sink: @Sendable (Data) throws -> Void
  private let closeSink: @Sendable () -> Void
  private var pending = 0
  private var offered = 0
  private var written = 0
  private var lost = 0
  private var bytes = 0
  private var failure: String?
  private var phase = "writing"
  private var videoOutcome: [String: Any]?

  init(path: String, epoch: UInt64, recordingID: String, target: [String: Any],
       capacity: Int = 64, byteLimit: Int = 64 * 1024 * 1024,
       testSink: (@Sendable (Data) throws -> Void)? = nil) throws {
    self.path = path; self.epoch = epoch
    self.capacity = capacity; self.byteLimit = byteLimit
    precondition(capacity > 0 && byteLimit > 0)
    if let testSink {
      sink = testSink; closeSink = {}
    } else {
      // The file is new, task-owned and private; never follow an existing leaf.
      let fd = open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
      guard fd >= 0 else { throw RPCError(code: "source_journal", message: "cannot create source journal") }
      let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
      sink = { data in try handle.write(contentsOf: data) }
      closeSink = { try? handle.close() }
    }
    offer(["kind": "header", "schema": "record-screen-source/v1", "recording_id": recordingID,
           "epoch_host_ns": String(epoch), "clock_domain": "CLOCK_UPTIME_RAW", "target": target,
           "video_time_origin": "encoded time zero corresponds to epoch_host_ns",
           "requested_video_timescale": 1_000_000_000, "requested_movie_timescale": 1_000_000_000,
           "limits": ["SCK transform is a candidate until qualified for the app/display transition",
                      "Frame spacing is not a source-drop count", "No input or action ownership inferred"]])
  }

  func relative(_ ns: UInt64) -> String {
    ns >= epoch ? String(ns - epoch) : "-" + String(epoch - ns)
  }

  @discardableResult func offer(_ row: [String: Any]) -> Bool {
    lock.withLock {
      guard phase == "writing" else { return false }
      offered += 1
      guard pending < capacity, failure == nil else { lost += 1; return false }
      pending += 1
      let sequence = offered - 1
      io.async { [self] in write(row, sequence: sequence) }
      return true
    }
  }

  private func write(_ row: [String: Any], sequence: Int) {
      defer { lock.withLock { pending -= 1 } }
      var value = row; value["journal_sequence"] = sequence
      guard var data = jsonData(value, options: [.sortedKeys]) else {
        lock.withLock { lost += 1; failure = "source row serialization failed" }; return
      }
      data.append(10)
      guard lock.withLock({ failure == nil && bytes + data.count <= byteLimit }) else {
        lock.withLock { lost += 1; if failure == nil { failure = "source journal byte limit reached" } }; return
      }
      do {
        try sink(data)
        lock.withLock { bytes += data.count; written += 1 }
      } catch {
        lock.withLock { lost += 1; failure = "source journal write failed" }
      }
  }

  /// Queues closure behind accepted rows. Never waits on the capture queue.
  /// A blocked file writer retains at most capacity rows; status says draining.
  func finish(outcome: [String: Any]? = nil, _ completion: (@Sendable () -> Void)? = nil) {
    lock.withLock {
      guard phase == "writing" else { return }
      videoOutcome = outcome
      phase = "draining"
      io.async { [self] in close(completion) }
    }
  }

  private func close(_ completion: (@Sendable () -> Void)?) {
      var footer = describe(); footer["kind"] = "footer"; footer["state"] = "closed"
      footer["complete"] = lock.withLock { lost == 0 && failure == nil }
      if var data = jsonData(footer, options: [.sortedKeys]) {
        data.append(10)
        if lock.withLock({ bytes + data.count <= byteLimit && failure == nil }) {
          do { try sink(data); lock.withLock { bytes += data.count } }
          catch { lock.withLock { failure = "source journal footer write failed" } }
        } else {
          lock.withLock { if failure == nil { failure = "source journal footer byte limit reached" } }
        }
      }
      closeSink()
      lock.withLock { phase = "closed" }
      completion?()
  }

  func describe() -> [String: Any] {
    lock.withLock {
      ["schema": "record-screen-source/v1", "path": path, "epoch_host_ns": String(epoch),
       "state": phase, "rows_offered": offered, "rows_written": written,
       "rows_lost": lost, "pending_rows": pending, "bytes": bytes,
       "complete": phase == "closed" && lost == 0 && failure == nil,
       "complete_qualification": "accepted journal rows closed; not video finalization or muxed coverage",
       "video_outcome": videoOutcome as Any? ?? NSNull(),
       "error": failure as Any? ?? NSNull(), "max_pending_rows": capacity, "max_bytes": byteLimit]
    }
  }

  static func hostNS(_ time: CMTime) -> UInt64? {
    guard time.isValid, time.isNumeric, time.value >= 0 else { return nil }
    let scaled = CMTimeConvertScale(time, timescale: 1_000_000_000, method: .roundTowardZero)
    guard scaled.isNumeric, scaled.value >= 0 else { return nil }
    return UInt64(scaled.value)
  }

  static func geometry(_ info: [SCStreamFrameInfo: Any], pixels: [Int]) -> [String: Any] {
    func rect(_ key: SCStreamFrameInfo) -> CGRect? {
      if let r = info[key] as? CGRect { return r }
      if let d = info[key] as? NSDictionary { return CGRect(dictionaryRepresentation: d) }
      return nil
    }
    let screen = rect(.screenRect), content = rect(.contentRect)
    let scale = (info[.scaleFactor] as? NSNumber)?.doubleValue
    let shrink = (info[.contentScale] as? NSNumber)?.doubleValue
    var matrix: Any = NSNull()
    if let screen, let content, let scale, let shrink {
      let factor = scale * shrink
      let values = [factor, 0, 0, factor,
                    content.minX * scale - screen.minX * factor,
                    content.minY * scale - screen.minY * factor]
      if scale > 0 && shrink > 0 && values.allSatisfy(\.isFinite) { matrix = values }
    }
    return ["screen_points": screen.map(rectDict) as Any? ?? NSNull(),
            "content_points": content.map(rectDict) as Any? ?? NSNull(),
            "scale_factor": scale as Any? ?? NSNull(), "content_scale": shrink as Any? ?? NSNull(),
            "source_pixels": pixels, "desktop_points_to_source_pixels": matrix,
            "transform_qualification": "candidate_sck_affine; fixture-qualified only on tested geometry"]
  }
}
