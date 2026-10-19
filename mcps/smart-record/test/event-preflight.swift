import AppKit
import CoreGraphics

// Checks existing grants and clock domains without requesting access or listening to input.
var spans: [UInt64] = []
var timestampedEvents = 0
for _ in 0..<1000 {
  let a = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
  let event = CGEvent(source: nil)!
  let b = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
  if event.timestamp > 0 { timestampedEvents += 1 }; spans.append(b-a)
}
spans.sort()
let out: [String: Any] = ["listen_granted": CGPreflightListenEventAccess(), "accessibility_granted": AXIsProcessTrusted(),
  "screen_capture_granted": CGPreflightScreenCaptureAccess(), "samples": 1000,
  "created_events_with_nonzero_timestamp": timestampedEvents,
  "construction_span_ns_p50": spans[500], "construction_span_ns_p99": spans[990],
  "limit": "Unposted CGEvents may have timestamp zero. Only delivered events can qualify input/frame synchronization."]
print(String(data: try! JSONSerialization.data(withJSONObject: out, options: [.sortedKeys]), encoding: .utf8)!)
