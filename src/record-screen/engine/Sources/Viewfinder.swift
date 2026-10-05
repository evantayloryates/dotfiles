import CoreImage
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers
import VideoToolbox

/// Receives viewfinder frames and keeps only the newest one.
private final class FrameSink: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
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

/// One warm stream, re-aimed at whatever the agent verifies next.
/// Measured: re-aiming a running stream reached a frame in 37–44 ms, reading the
/// newest frame of an unchanged target in 13–35 ms, a cold screenshot 130–270 ms.
/// The stream stops after `idleSeconds` without use.
actor Viewfinder {
  private var stream: SCStream?
  private var sink: FrameSink?
  private var key: String?
  private var configKey: String?
  private var lastUsed: UInt64 = 0
  private var idleTask: Task<Void, Never>?
  private let idleSeconds: Double = 20

  struct Grab {
    let image: CGImage
    let source: String  // "live" (newest frame of an unchanged target), "reaim", "start", "screenshot"
    let ms: Double
  }

  func grab(_ t: ResolvedTarget, maxWidth: Int?) async throws -> Grab {
    let t0 = uptimeNs()
    lastUsed = t0
    scheduleIdleStop()
    let cfg = t.configuration(maxWidth: maxWidth)
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: 30)
    cfg.queueDepth = 4
    let cfgKey = "\(cfg.width)x\(cfg.height)@\(t.sourceRect.map { "\($0)" } ?? "full")"
    func done(_ pb: CVPixelBuffer, _ source: String) throws -> Grab {
      Grab(image: try cgImage(pb), source: source, ms: Double(uptimeNs() - t0) / 1e6)
    }
    func screenshot(_ source: String) async throws -> Grab {
      let img = try await SCScreenshotManager.captureImage(contentFilter: t.filter, configuration: t.configuration(maxWidth: maxWidth))
      return Grab(image: img, source: source, ms: Double(uptimeNs() - t0) / 1e6)
    }

    guard let stream, let sink, sink.stoppedError == nil else {
      await stop()
      let sink = FrameSink()
      let s = SCStream(filter: t.filter, configuration: cfg, delegate: sink)
      try s.addStreamOutput(sink, type: .screen, sampleHandlerQueue: DispatchQueue(label: "record-screen.viewfinder"))
      try await s.startCapture()
      self.stream = s; self.sink = sink; key = t.key; configKey = cfgKey
      if let pb = await sink.waitForFrame(shownAfterNs: 0, width: cfg.width, height: cfg.height, timeoutMs: 1000) {
        return try done(pb, "start")
      }
      return try await screenshot("screenshot")
    }

    if key == t.key && configKey == cfgKey, case let (pb?, _, _) = sink.snapshot() {
      return try done(pb, "live")
    }

    if key != t.key {
      // A new content filter (other window, other display, outline exclusion)
      // lands a frame or two late on a running stream, and nothing in the frame
      // says which filter made it. Answer with an authoritative screenshot and
      // re-aim the stream for the checks that follow.
      let grab = try await screenshot("screenshot")
      do {
        try await stream.updateContentFilter(t.filter)
        try await stream.updateConfiguration(cfg)
        key = t.key; configKey = cfgKey
      } catch {
        await stop()
      }
      return grab
    }

    // Same filter, new area or size: frames say which area they cover, so wait
    // for one that matches.
    do {
      try await stream.updateConfiguration(cfg)
      let updated = uptimeNs()
      configKey = cfgKey
      let want = t.sourceRect.map { $0.offsetBy(dx: t.display.frame.minX, dy: t.display.frame.minY) } ?? t.display.frame
      if let pb = await sink.waitForFrame(shownAfterNs: updated, width: cfg.width, height: cfg.height,
                                          screenRect: want, timeoutMs: 250) {
        return try done(pb, "reaim")
      }
    } catch {
      await stop()
    }
    return try await screenshot("screenshot")
  }

  var lastScreenRect: CGRect { sink?.screenRect ?? .null }

  func stop() async {
    if let s = stream { try? await s.stopCapture() }
    stream = nil; sink = nil; key = nil; configKey = nil
  }

  var state: [String: Any] {
    ["running": stream != nil, "target": key ?? "", "idle_s": stream == nil ? 0 : Double(uptimeNs() - lastUsed) / 1e9]
  }

  private func scheduleIdleStop() {
    idleTask?.cancel()
    idleTask = Task { [idleSeconds] in
      try? await Task.sleep(nanoseconds: UInt64(idleSeconds * 1e9))
      if !Task.isCancelled { await self.stop() }
    }
  }

  private func cgImage(_ pb: CVPixelBuffer) throws -> CGImage {
    var img: CGImage?
    VTCreateCGImageFromCVPixelBuffer(pb, options: nil, imageOut: &img)
    guard let img else { throw RPCError(code: "internal", message: "could not convert frame") }
    return img
  }
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
