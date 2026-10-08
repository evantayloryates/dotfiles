import AppKit
import ScreenCaptureKit
import AVFoundation

// Bounded metadata-only stream; no input, encoder, daemon mutation or grant request.
final class Collector: NSObject, SCStreamOutput, @unchecked Sendable {
  let lock = NSLock()
  var frames: [[String: Any]] = []
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
      if let value = info[key] { row[label] = String(describing: value) }
    }
    if let buffer = CMSampleBufferGetImageBuffer(sample) { row["pixels"] = [CVPixelBufferGetWidth(buffer), CVPixelBufferGetHeight(buffer)] }
    lock.lock(); if frames.count < 20000 { frames.append(row) }; lock.unlock()
  }
}
@main struct StreamProbe {
  static func main() async {
    do {
      NSApplication.shared.setActivationPolicy(.prohibited)
      let a = CommandLine.arguments
      guard a.count == 4, let id = UInt32(a[1]), let seconds = Double(a[2]), seconds > 0, seconds <= 60 else { exit(2) }
      guard CGPreflightScreenCaptureAccess() else { exit(3) }
      let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
      guard let window = content.windows.first(where: { $0.windowID == id }) else { exit(4) }
      guard let display = content.displays.max(by: { lhs, rhs in
        let l = window.frame.intersection(lhs.frame), r = window.frame.intersection(rhs.frame)
        return l.width * l.height < r.width * r.height
      }) else { exit(4) }
      let screen = NSScreen.screens.first { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == display.displayID }
      let scale = screen?.backingScaleFactor ?? 1
      let config = SCStreamConfiguration()
      config.width = Int(window.frame.width * scale); config.height = Int(window.frame.height * scale)
      config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
      config.showsCursor = false; config.includeChildWindows = false
      let output = Collector()
      let stream = SCStream(filter: SCContentFilter(desktopIndependentWindow: window), configuration: config, delegate: nil)
      try stream.addStreamOutput(output, type: .screen, sampleHandlerQueue: DispatchQueue(label: "qualification-frames"))
      try await stream.startCapture()
      try await Task.sleep(nanoseconds: UInt64(seconds * 1e9))
      try await stream.stopCapture()
      let rows = output.snapshot()
      let result: [String: Any] = ["window_id": id, "seconds": seconds, "frames": rows,
        "limit": "Metadata clock-domain and geometry probe only; does not prove end-to-end action-to-pixel alignment."]
      try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]).write(to: URL(fileURLWithPath: a[3]))
      print("{\"frames\":\(rows.count)}")
    } catch { print("\(error)"); exit(1) }
  }
}
