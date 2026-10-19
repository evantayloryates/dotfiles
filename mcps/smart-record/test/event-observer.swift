import AppKit
import CoreGraphics

// Bounded passive telemetry probe. Never requests permissions or posts/filters input.
// Retains key codes (never characters) for an explicit fixture destination or foreground.
// Outside-scope input is represented by counts only. Source PID/tag are clues, not identity.
let a = CommandLine.arguments
guard a.count == 4, let target = Int32(a[1]), let seconds = Double(a[2]), seconds > 0, seconds <= 180 else { exit(2) }
guard CGPreflightListenEventAccess() else { print("{\"error\":\"listen_permission_missing\"}"); exit(3) }
let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
final class EventState {
 let target: pid_t
 var rows: [[String: Any]] = []
 var excluded = 0
 var lastForeground: pid_t = 0
 var timedOut = 0
 var callbackCount = 0
 var destinationUnknown = 0
 init(_ target: pid_t) { self.target = target }
}
let state = EventState(target)
let start = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
let kinds: [CGEventType] = [.mouseMoved, .leftMouseDown, .leftMouseUp, .leftMouseDragged,
 .rightMouseDown, .rightMouseUp, .rightMouseDragged, .otherMouseDown, .otherMouseUp,
 .scrollWheel, .keyDown, .keyUp, .flagsChanged]
let mask = kinds.reduce(CGEventMask(0)) { $0 | (CGEventMask(1) << $1.rawValue) }
let tap = CGEvent.tapCreate(tap: .cgAnnotatedSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
 eventsOfInterest: mask, callback: { _, kind, event, info in
  let state = Unmanaged<EventState>.fromOpaque(info!).takeUnretainedValue()
  if kind == .tapDisabledByTimeout || kind == .tapDisabledByUserInput { state.timedOut += 1; return Unmanaged.passUnretained(event) }
  state.callbackCount += 1
  let fg = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
  let destination = event.getIntegerValueField(.eventTargetUnixProcessID)
  if destination == 0 { state.destinationUnknown += 1 }
  if fg != state.lastForeground {
    state.rows.append(["kind": "focus_scope", "uptime_ns": clock_gettime_nsec_np(CLOCK_UPTIME_RAW), "target_foreground": fg == state.target])
    state.lastForeground = fg
  }
  guard destination == state.target || fg == state.target else { state.excluded += 1; return Unmanaged.passUnretained(event) }
  var row: [String: Any] = ["type": kind.rawValue, "timestamp_ns": event.timestamp,
    "received_ns": clock_gettime_nsec_np(CLOCK_UPTIME_RAW), "x": event.location.x, "y": event.location.y,
    "flags": event.flags.rawValue, "foreground_pid": fg,
    "source_pid": event.getIntegerValueField(.eventSourceUnixProcessID),
    "target_pid": destination,
    "source_tag": event.getIntegerValueField(.eventSourceUserData),
    "scope_evidence": destination == state.target ? "explicit fixture destination" : "fixture foreground only", "origin": "unknown"]
  if kind == .keyDown || kind == .keyUp { row["key_code"] = event.getIntegerValueField(.keyboardEventKeycode) }
  if kind == .scrollWheel {
    row["scroll_x"] = event.getDoubleValueField(.scrollWheelEventPointDeltaAxis2)
    row["scroll_y"] = event.getDoubleValueField(.scrollWheelEventPointDeltaAxis1)
  }
  if state.rows.count < 20000 { state.rows.append(row) } else { state.timedOut += 1 }
  return Unmanaged.passUnretained(event)
 }, userInfo: Unmanaged.passUnretained(state).toOpaque())
guard let tap else { print("{\"error\":\"tap_unavailable\"}"); exit(4) }
let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { _ in CFRunLoopStop(CFRunLoopGetCurrent()) }
CFRunLoopRun()
let enabledAtEnd = CGEvent.tapIsEnabled(tap: tap)
CGEvent.tapEnable(tap: tap, enable: false)
CFMachPortInvalidate(tap)
let out: [String: Any] = ["target_pid": target, "start_ns": start, "end_ns": clock_gettime_nsec_np(CLOCK_UPTIME_RAW),
 "callback_count": state.callbackCount, "destination_unknown_count": state.destinationUnknown,
 "tap_location": "annotated_session_head", "tap_enabled_at_end": enabledAtEnd,
 "retained": state.rows.count, "excluded_count": state.excluded, "tap_disables_or_capacity_overflows": state.timedOut,
 "events": state.rows, "limit": "Destination or foreground evidence only; no claim that source PID identifies the human or an agent"]
try JSONSerialization.data(withJSONObject: out, options: [.sortedKeys]).write(to: URL(fileURLWithPath: a[3]))
print("{\"retained\":\(state.rows.count),\"excluded_count\":\(state.excluded),\"tap_disables_or_capacity_overflows\":\(state.timedOut)}")
