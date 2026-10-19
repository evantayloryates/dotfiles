import AppKit
import ScreenCaptureKit
import CoreGraphics

// Isolated qualification helper. No daemon restart, permission request, or UI input.
// Usage: capture-probe WINDOW_ID MODE OUTPUT.png [CURSOR] [CHILDREN] [MARGIN] [EXCLUDE_PID]
// MODE: isolated | included-window | app | rect | rect-excluding-pid
@main struct Probe {
  static func main() async {
    do {
      let application = NSApplication.shared
      application.setActivationPolicy(.prohibited)
      let a = CommandLine.arguments
      guard a.count >= 4, let id = UInt32(a[1]) else { throw NSError(domain: "arguments", code: 1) }
      guard CGPreflightScreenCaptureAccess() else { throw NSError(domain: "screen-recording-permission-missing", code: 2) }
      let cursor = a.count > 4 && a[4] == "true"
      let children = a.count <= 5 || a[5] == "true"
      let margin = a.count > 6 ? Double(a[6]) ?? 0 : 0
      let before = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
      let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
      guard let w = content.windows.first(where: { $0.windowID == id }),
            let app = w.owningApplication,
            let display = content.displays.max(by: { lhs, rhs in
              let l = w.frame.intersection(lhs.frame), r = w.frame.intersection(rhs.frame)
              return l.width * l.height < r.width * r.height
            }) else { throw NSError(domain: "target-missing", code: 3) }
      let mode = a[2]
      let filter: SCContentFilter
      var excludedPID: Int32?
      switch mode {
      case "isolated": filter = SCContentFilter(desktopIndependentWindow: w)
      case "included-window": filter = SCContentFilter(display: display, including: [w])
      case "app": filter = SCContentFilter(display: display, including: [app], exceptingWindows: [])
      case "rect": filter = SCContentFilter(display: display, excludingWindows: [])
      case "rect-excluding-pid":
        guard a.count > 7, let pid = Int32(a[7]), let overlay = content.applications.first(where: { $0.processID == pid }) else { throw NSError(domain: "excluded-app-missing", code: 6) }
        excludedPID = pid
        filter = SCContentFilter(display: display, excludingApplications: [overlay], exceptingWindows: [])
      default: throw NSError(domain: "unknown-mode", code: 4)
      }
      let c = SCStreamConfiguration()
      c.showsCursor = cursor
      c.showMouseClicks = false
      c.includeChildWindows = children
      c.colorSpaceName = CGColorSpace.sRGB
      c.ignoreShadowsSingleWindow = true
      c.ignoreShadowsDisplay = true
      let crop = mode == "isolated" ? w.frame : w.frame.insetBy(dx: -margin, dy: -margin).intersection(display.frame)
      let screen = NSScreen.screens.first { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == display.displayID }
      let scale = Double(screen?.backingScaleFactor ?? 1)
      if mode != "isolated" {
        c.sourceRect = crop.offsetBy(dx: -display.frame.minX, dy: -display.frame.minY)
      }
      let size = mode == "isolated" ? w.frame.size : crop.size
      c.width = max(2, Int(size.width * scale))
      c.height = max(2, Int(size.height * scale))
      let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: c)
      let bitmap = NSBitmapImageRep(cgImage: image)
      guard let png = bitmap.representation(using: .png, properties: [:]) else { throw NSError(domain: "png", code: 5) }
      try png.write(to: URL(fileURLWithPath: a[3]), options: .atomic)
      let after = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
      let metadata: [String: Any] = ["mode": mode, "window_id": id, "app": app.bundleIdentifier,
        "excluded_pid": excludedPID.map { $0 as Any } ?? NSNull(),
        "show_cursor": cursor, "include_children": children, "requested_margin_points": margin,
        "margin_points": mode == "isolated" ? 0 : margin,
        "window": rect(w.frame), "crop": rect(crop), "display_id": display.displayID,
        "scale": scale, "pixels": [image.width, image.height], "before_ns": before,
        "after_ns": after, "elapsed_ms": Double(after - before) / 1e6, "output": a[3]]
      print(String(data: try JSONSerialization.data(withJSONObject: metadata, options: [.sortedKeys]), encoding: .utf8)!)
    } catch {
      print("{\"error\":\"\(String(describing: error).replacingOccurrences(of: "\"", with: "'"))\"}")
      exit(1)
    }
  }
  static func rect(_ r: CGRect) -> [String: Double] { ["x": r.minX, "y": r.minY, "w": r.width, "h": r.height] }
}
