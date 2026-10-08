import AppKit
import ScreenCaptureKit
import AVFoundation
import CoreImage

// Bounded stream probe; optional sparse source PNGs and authored marker sampling.
// No input, encoder, daemon mutation or grant request.
final class Collector: NSObject, SCStreamOutput, @unchecked Sendable {
  let lock = NSLock()
  var frames: [[String: Any]] = []
  let imageQueue = DispatchQueue(label: "qualification-source-pngs")
  let imageSlots = DispatchSemaphore(value: 2)
  let context = CIContext()
  var evidenceDirectory: URL?
  var lastEvidenceNS: Double = -1e20
  var lastMarker = -1
  var evidenceCount = 0
  var evidenceErrors = 0
  var evidenceSkipped = 0
  var sampleMarker = false
  func flushEvidence() { imageQueue.sync {} }
  func markerCounts(_ buffer: CVPixelBuffer) -> [Int] {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return [0, 0, 0] }
    let bytes = base.assumingMemoryBound(to: UInt8.self)
    let stride = CVPixelBufferGetBytesPerRow(buffer), width = CVPixelBufferGetWidth(buffer), height = CVPixelBufferGetHeight(buffer)
    var counts = [0, 0, 0]
    for y in Swift.stride(from: 0, to: height, by: 4) {
      for x in Swift.stride(from: 0, to: width, by: 4) {
        let i = y * stride + x * 4, b = bytes[i], g = bytes[i + 1], r = bytes[i + 2]
        if r > 180 && g < 60 && b < 60 { counts[0] += 1 }
        if g > 180 && r < 60 && b < 60 { counts[1] += 1 }
        if b > 180 && r < 60 && g < 60 { counts[2] += 1 }
      }
    }
    return counts
  }
  var timebase = mach_timebase_info_data_t()
  override init() { super.init(); mach_timebase_info(&timebase) }
  func snapshot() -> [[String: Any]] { lock.lock(); defer { lock.unlock() }; return frames }
  func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen,
      let info = (CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]])?.first else { return }
    var row: [String: Any] = ["received_ns": clock_gettime_nsec_np(CLOCK_UPTIME_RAW),
      "pts_ns": sample.presentationTimeStamp.seconds * 1e9]
    for (key, label) in [(SCStreamFrameInfo.status, "status"), (.scaleFactor, "scale_factor"), (.contentScale, "content_scale")] {
      if let value = info[key] as? NSNumber { row[label] = value }
    }
    if let t = info[.displayTime] as? NSNumber {
      row["display_ns"] = Double(t.uint64Value) * Double(timebase.numer) / Double(timebase.denom)
    }
    for (key, label) in [(SCStreamFrameInfo.contentRect, "content_rect"), (.screenRect, "screen_rect")] {
      if let value = info[key] {
        if let rectangle = value as? CGRect {
          row[label] = ["x": rectangle.minX, "y": rectangle.minY, "w": rectangle.width, "h": rectangle.height]
        } else if let dictionary = value as? NSDictionary, let rectangle = CGRect(dictionaryRepresentation: dictionary) {
          row[label] = ["x": rectangle.minX, "y": rectangle.minY, "w": rectangle.width, "h": rectangle.height]
        } else { row[label] = String(describing: value) }
      }
    }
    if let buffer = CMSampleBufferGetImageBuffer(sample) {
      row["pixels"] = [CVPixelBufferGetWidth(buffer), CVPixelBufferGetHeight(buffer)]
      if (row["status"] as? Int) == SCFrameStatus.complete.rawValue {
        let pts = sample.presentationTimeStamp.seconds * 1e9
        var marker = lastMarker
        if sampleMarker {
          let counts = markerCounts(buffer); row["marker_counts"] = counts
          marker = counts.enumerated().max(by: { $0.element < $1.element }).map { $0.element >= 50 ? $0.offset : -1 } ?? -1
          row["marker"] = marker
        }
        if let directory = evidenceDirectory, evidenceCount < 180, pts - lastEvidenceNS >= 1e9 || marker != lastMarker,
           imageSlots.wait(timeout: .now()) == .success {
          let file = directory.appendingPathComponent(String(format: "frame-%05d.png", frames.count))
          row["evidence_png"] = file.path
          lastEvidenceNS = pts; evidenceCount += 1
          imageQueue.async { [self, buffer] in
            defer { imageSlots.signal() }
            let source = CIImage(cvPixelBuffer: buffer)
            if let image = context.createCGImage(source, from: source.extent),
               let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) {
              do { try png.write(to: file) } catch { lock.lock(); evidenceErrors += 1; lock.unlock() }
            } else { lock.lock(); evidenceErrors += 1; lock.unlock() }
          }
        } else if evidenceDirectory != nil && (pts - lastEvidenceNS >= 1e9 || marker != lastMarker) { evidenceSkipped += 1 }
        lastMarker = marker
      }
    }
    lock.lock(); if frames.count < 20000 { frames.append(row) }; lock.unlock()
  }
}
@main struct StreamProbe {
  static func main() async {
    do {
      NSApplication.shared.setActivationPolicy(.prohibited)
      let a = CommandLine.arguments
      guard (a.count == 4 || a.count == 5), let id = UInt32(a[1]), let seconds = Double(a[2]), seconds > 0, seconds <= 60 else { exit(2) }
      // Includes discovery/start/stop, which can otherwise wait indefinitely
      // after a capture-service disconnect. Never leave an orphaned probe.
      DispatchQueue.global().asyncAfter(deadline: .now() + seconds + 15) {
        fputs("qualification watchdog: capture did not finish within wall-time bound\n", stderr); exit(124)
      }
      guard CGPreflightScreenCaptureAccess() else { exit(3) }
      let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
      guard let window = content.windows.first(where: { $0.windowID == id }) else { exit(4) }
      guard let display = content.displays.max(by: { lhs, rhs in
        let l = window.frame.intersection(lhs.frame), r = window.frame.intersection(rhs.frame)
        return l.width * l.height < r.width * r.height
      }) else { exit(4) }
      let screen = NSScreen.screens.first { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == display.displayID }
      let scale = screen?.backingScaleFactor ?? 1
      let options = a.count == 5 ? (try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: a[4]))) as? [String: Any] ?? [:]) : [:]
      let mode = options["mode"] as? String ?? "isolated"
      let margin = options["margin"] as? Double ?? 0
      let crop = mode == "isolated" ? window.frame : window.frame.insetBy(dx: -margin, dy: -margin).intersection(display.frame)
      let filter: SCContentFilter
      switch mode {
      case "isolated": filter = SCContentFilter(desktopIndependentWindow: window)
      case "included-window": filter = SCContentFilter(display: display, including: [window])
      case "rect": filter = SCContentFilter(display: display, excludingWindows: [])
      case "rect-excluding-pid":
        guard let pid = options["exclude_pid"] as? Int32, let app = content.applications.first(where: { $0.processID == pid }) else { exit(5) }
        filter = SCContentFilter(display: display, excludingApplications: [app], exceptingWindows: [])
      default: exit(2)
      }
      let config = SCStreamConfiguration()
      config.pixelFormat = kCVPixelFormatType_32BGRA
      config.colorSpaceName = CGColorSpace.sRGB
      config.ignoreShadowsSingleWindow = true
      config.ignoreShadowsDisplay = true
      if mode != "isolated" { config.sourceRect = crop.offsetBy(dx: -display.frame.minX, dy: -display.frame.minY) }
      config.width = Int(crop.width * scale); config.height = Int(crop.height * scale)
      config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
      config.showsCursor = false; config.includeChildWindows = options["include_children"] as? Bool ?? false
      let output = Collector()
      output.sampleMarker = options["sample_marker"] as? Bool ?? false
      if let path = options["evidence_directory"] as? String {
        let directory = URL(fileURLWithPath: path)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        output.evidenceDirectory = directory
      }
      let stream = SCStream(filter: filter, configuration: config, delegate: nil)
      try stream.addStreamOutput(output, type: .screen, sampleHandlerQueue: DispatchQueue(label: "qualification-frames"))
      try await stream.startCapture()
      try await Task.sleep(nanoseconds: UInt64(seconds * 1e9))
      try await stream.stopCapture()
      output.flushEvidence()
      let rows = output.snapshot()
      let result: [String: Any] = ["window_id": id, "seconds": seconds, "frames": rows,
        "options": options, "evidence_errors": output.evidenceErrors, "evidence_skipped": output.evidenceSkipped,
        "encoded_pixels": [config.width, config.height], "display_id": display.displayID, "scale": scale,
        "crop": [crop.minX, crop.minY, crop.width, crop.height],
        "limit": "Marker timestamps represent fixture action handling, not dispatch or physical input. Sparse PNG encoding adds probe overhead. Fixed display crop does not track moving windows."]
      try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]).write(to: URL(fileURLWithPath: a[3]))
      print("{\"frames\":\(rows.count)}")
    } catch { print("\(error)"); exit(1) }
  }
}
