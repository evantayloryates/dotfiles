import AppKit
import CoreGraphics

// Read-only metadata for ONE explicitly supplied process; no unrelated window titles.
NSApplication.shared.setActivationPolicy(.prohibited)
guard CommandLine.arguments.count == 2, let pid = Int32(CommandLine.arguments[1]) else { exit(2) }
let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] ?? []
let selected = windows.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid }
print(String(data: try! JSONSerialization.data(withJSONObject: selected, options: [.sortedKeys]), encoding: .utf8)!)
