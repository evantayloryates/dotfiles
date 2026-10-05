import CoreImage
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers
import VideoToolbox

/// Receives viewfinder frames and keeps only the newest one.
final class FrameSink: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
  private let lock = NSLock()
  private var latest: CVPixelBuffer?
  private(set) var seq: UInt64 = 0
  private var latestAt: UInt64 = 0
  /// When the newest frame was on the display (host clock, ns).
  private var latestDisplayNs: UInt64 = 0
  /// What ScreenCaptureKit says the newest frame covers (screen points).
  private var latestScreenRect: CGRect = .null
  var stoppedError: Error?

  func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen,
          let info = (CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]])?.first,
          let raw = info[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete,
          let pb = CMSampleBufferGetImageBuffer(sb) else { return }
    let shown = (info[.displayTime] as? UInt64).map(machToNs) ?? uptimeNs()
    let rect = (info[.screenRect] as? NSDictionary).flatMap { CGRect(dictionaryRepresentation: $0) } ?? .null
    lock.lock()
    latest = pb
    seq &+= 1
    latestAt = uptimeNs()
    latestDisplayNs = shown
    latestScreenRect = rect
    lock.unlock()
  }

  func stream(_ s: SCStream, didStopWithError error: Error) { stoppedError = error }

  private func current() -> (CVPixelBuffer?, UInt64, CGRect) {
    lock.lock(); defer { lock.unlock() }
    return (latest, latestDisplayNs, latestScreenRect)
  }

  var screenRect: CGRect { lock.lock(); defer { lock.unlock() }; return latestScreenRect }

  func snapshot() -> (CVPixelBuffer?, UInt64, UInt64) {
    lock.lock(); defer { lock.unlock() }
    return (latest, seq, latestAt)
  }

  /// Waits for a frame of the expected size that was on screen after
  /// `shownAfterNs`, so a frame still in flight from the previous target is
  /// never mistaken for the new one. nil on timeout: static content produces
  /// no new frames, so callers fall back to a one-off screenshot.
  func waitForFrame(shownAfterNs: UInt64, width: Int, height: Int, screenRect: CGRect? = nil, timeoutMs: Double) async -> CVPixelBuffer? {
    let deadline = uptimeNs() + UInt64(timeoutMs * 1e6)
    while uptimeNs() < deadline {
      let (pb, shown, rect) = current()
      let rectOK = screenRect.map { want in rect.isNull || (abs(rect.minX - want.minX) < 1 && abs(rect.minY - want.minY) < 1
        && abs(rect.width - want.width) < 1 && abs(rect.height - want.height) < 1) } ?? true
      if let pb, shown >= shownAfterNs, rectOK, CVPixelBufferGetWidth(pb) == width, CVPixelBufferGetHeight(pb) == height { return pb }
      try? await Task.sleep(nanoseconds: 2_000_000)
    }
    return nil
  }
}

/// One warm stream per target (a "lane"), never re-aimed.
///
/// A single re-aimed stream was fast for one agent but wrong under concurrency:
/// with 8 agents checking the same area at once, 30 of 40 images showed the
/// previous target, because the stream's bookkeeping moved before its frames
/// did. Lanes fix that by construction: a lane's filter and area never change,
/// every frame it returns is checked against the area and size it should
/// cover, and concurrent checks of the same target share one lane (and one
/// start-up). Different targets run in parallel on separate lanes.
/// Measured cost of a lane: a few percent of a core while content changes,
/// near zero while it is static, and no hardware encoder session. Lanes stop
/// after 20 s idle; at most 24 live.
final class Lane: @unchecked Sendable {
  let key: String
  let sink = FrameSink()
  let width: Int, height: Int
  /// Screen area every frame must cover (display and rect targets).
  let expectedRect: CGRect?
  var stream: SCStream?
  var ready: Task<Void, Error>?
  var restart: Task<Void, Error>?
  var lastUsed = uptimeNs()
  var served = 0

  init(key: String, width: Int, height: Int, expectedRect: CGRect?) {
    self.key = key
    self.width = width
    self.height = height
    self.expectedRect = expectedRect
  }

  var healthy: Bool { sink.stoppedError == nil }

  func start(filter: SCContentFilter, config: SCStreamConfiguration) async throws {
    let s = SCStream(filter: filter, configuration: config, delegate: sink)
    try s.addStreamOutput(sink, type: .screen, sampleHandlerQueue: DispatchQueue(label: "record-screen.lane"))
    try await s.startCapture()
    stream = s
  }

  func stop() async {
    if let s = stream { try? await s.stopCapture() }
    stream = nil
  }
}

actor Viewfinder {
  static let maxLanes = 24
  static let idleSeconds: Double = 20
  private var lanes: [String: Lane] = [:]
  private var sweeper: Task<Void, Never>?

  struct Grab {
    let image: CGImage
    /// live (warm lane), start (first frame of a new lane), tap (frame from a
    /// running recording of the same area), screenshot (fallback)
    let source: String
    let ms: Double
  }

  func grab(_ t: ResolvedTarget, maxWidth: Int?) async throws -> Grab {
    let t0 = uptimeNs()
    let cfg = t.configuration(maxWidth: maxWidth)
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: 30)
    cfg.queueDepth = 4
    let key = "\(t.key)|\(t.areaKey)|\(cfg.width)x\(cfg.height)"
    let expected: CGRect? = t.window == nil
      ? (t.sourceRect.map { $0.offsetBy(dx: t.display.frame.minX, dy: t.display.frame.minY) } ?? t.display.frame) : nil

    // Find or open the lane before any suspension point, so concurrent
    // callers for the same target share it (actor reentrancy safe).
    let lane: Lane
    var created = false
    if let l = lanes[key], l.healthy {
      lane = l
    } else {
      created = true
      lane = Lane(key: key, width: cfg.width, height: cfg.height, expectedRect: expected)
      lanes[key] = lane
      lane.ready = Task { try await lane.start(filter: t.filter, config: cfg) }
      evictIfNeeded()
    }
    lane.lastUsed = t0
    ensureSweeper()

    func screenshot() async throws -> Grab {
      let img = try await SCScreenshotManager.captureImage(contentFilter: t.filter, configuration: t.configuration(maxWidth: maxWidth))
      return Grab(image: img, source: "screenshot", ms: Double(uptimeNs() - t0) / 1e6)
    }
    do {
      try await lane.ready?.value
    } catch {
      if lanes[key] === lane { lanes[key] = nil }
      return try await screenshot()
    }
    let fresh = lane.served == 0
    func frame(_ timeoutMs: Double) async -> CVPixelBuffer? {
      await lane.sink.waitForFrame(shownAfterNs: 0, width: lane.width, height: lane.height,
                                   screenRect: lane.expectedRect, timeoutMs: timeoutMs)
    }
    var pb = await frame(fresh ? 500 : 250)
    // A new stream occasionally starts silent (seen on a cold engine with
    // many concurrent first checks). Restart it once rather than fall back.
    if pb == nil, lane.sink.seq == 0, lanes[key] === lane {
      if lane.restart == nil {
        lane.restart = Task {
          await lane.stop()
          try await lane.start(filter: t.filter, config: cfg)
        }
        Log.event("lane_restart", ["key": key])
      }
      if (try? await lane.restart?.value) != nil { pb = await frame(700) }
    }
    if let pb {
      lane.served += 1
      return Grab(image: try cgImage(pb), source: created ? "start" : "live", ms: Double(uptimeNs() - t0) / 1e6)
    }
    return try await screenshot()
  }

  func stop() async {
    let all = lanes.values
    lanes.removeAll()
    for l in all { await l.stop() }
  }

  var state: [String: Any] {
    ["lanes": lanes.values.map { ["key": $0.key, "idle_s": Double(uptimeNs() - $0.lastUsed) / 1e9, "served": $0.served,
                                  "frames": Int($0.sink.seq), "frame_rect": rectDict($0.sink.screenRect), "expected": $0.expectedRect.map(rectDict) ?? [:]] },
     "max_lanes": Self.maxLanes]
  }

  private func evictIfNeeded() {
    while lanes.count > Self.maxLanes, let oldest = lanes.values.min(by: { $0.lastUsed < $1.lastUsed }) {
      lanes[oldest.key] = nil
      Task { await oldest.stop() }
    }
  }

  private func ensureSweeper() {
    guard sweeper == nil else { return }
    sweeper = Task {
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 5_000_000_000)
        await self.sweep()
      }
    }
  }

  private func sweep() async {
    let cutoff = uptimeNs() - UInt64(Self.idleSeconds * 1e9)
    for l in lanes.values where l.lastUsed < cutoff || !l.healthy {
      lanes[l.key] = nil
      await l.stop()
    }
    if lanes.isEmpty { sweeper?.cancel(); sweeper = nil }
  }
}

func cgImage(_ pb: CVPixelBuffer, maxWidth: Int? = nil) throws -> CGImage {
  var img: CGImage?
  VTCreateCGImageFromCVPixelBuffer(pb, options: nil, imageOut: &img)
  guard let img else { throw RPCError(code: "internal", message: "could not convert frame") }
  guard let m = maxWidth, img.width > m else { return img }
  let h = Int((Double(img.height) * Double(m) / Double(img.width)).rounded())
  guard let ctx = CGContext(data: nil, width: m, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else { return img }
  ctx.interpolationQuality = .high
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: m, height: h))
  return ctx.makeImage() ?? img
}

enum ImageOut {
  /// Writes JPEG (default) or PNG; returns byte count.
  static func write(_ img: CGImage, to path: String, format: String, quality: Double) throws -> Int {
    let type = format == "png" ? UTType.png : UTType.jpeg
    guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, type.identifier as CFString, 1, nil) else {
      throw RPCError(code: "io", message: "cannot write \(path)")
    }
    CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { throw RPCError(code: "io", message: "cannot write \(path)") }
    return (try? FileManager.default.attributesOfItem(atPath: path)[.size] as? Int) ?? 0
  }

  /// Cheap content check on a 32×32 thumbnail: a near-uniform image usually
  /// means a locked screen, a hidden app or a window that hasn't drawn yet.
  static func stats(_ img: CGImage) -> [String: Any] {
    let n = 32
    var px = [UInt8](repeating: 0, count: n * n * 4)
    guard let ctx = CGContext(data: &px, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4,
                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return [:] }
    ctx.interpolationQuality = .low
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: n, height: n))
    var lum = [Double](); lum.reserveCapacity(n * n)
    for i in stride(from: 0, to: px.count, by: 4) {
      lum.append(0.299 * Double(px[i]) + 0.587 * Double(px[i + 1]) + 0.114 * Double(px[i + 2]))
    }
    let mean = lum.reduce(0, +) / Double(lum.count)
    let sd = (lum.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(lum.count)).squareRoot()
    return ["luma_mean": (mean * 10).rounded() / 10, "luma_sd": (sd * 10).rounded() / 10, "looks_blank": sd < 2]
  }
}
