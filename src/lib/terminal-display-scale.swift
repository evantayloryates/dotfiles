import AppKit
import CoreGraphics

// Report the backing scale of the display containing most of Ghostty's front
// window. Called while an interactive command is running in Ghostty.
guard let app = NSWorkspace.shared.frontmostApplication,
      app.bundleIdentifier == "com.mitchellh.ghostty" else {
    print(1)
    exit(0)
}

let windows = CGWindowListCopyWindowInfo(
    [.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID
) as? [[String: Any]] ?? []

func windowRect(_ info: [String: Any]) -> CGRect? {
    guard let bounds = info[kCGWindowBounds as String] as? [String: Any],
          let x = bounds["X"] as? NSNumber,
          let y = bounds["Y"] as? NSNumber,
          let width = bounds["Width"] as? NSNumber,
          let height = bounds["Height"] as? NSNumber else { return nil }
    return CGRect(x: x.doubleValue, y: y.doubleValue,
                  width: width.doubleValue, height: height.doubleValue)
}

guard let window = windows.first(where: {
    ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == app.processIdentifier
        && (windowRect($0)?.width ?? 0) >= 100
        && (windowRect($0)?.height ?? 0) >= 100
}), let bounds = windowRect(window) else {
    print(1)
    exit(0)
}

let best = NSScreen.screens.compactMap { screen -> (CGFloat, CGFloat)? in
    guard let id = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")]
                    as? NSNumber)?.uint32Value else { return nil }
    let overlap = bounds.intersection(CGDisplayBounds(id))
    guard !overlap.isNull else { return nil }
    return (overlap.width * overlap.height, screen.backingScaleFactor)
}.max { $0.0 < $1.0 }

print(best.map { max(1, min(3, Int($0.1.rounded()))) } ?? 1)
