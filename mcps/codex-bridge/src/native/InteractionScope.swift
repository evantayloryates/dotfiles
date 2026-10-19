import Foundation
import CoreGraphics

/// Shared mechanical event provenance. This is not a semantic text classifier,
/// does not retain characters and never establishes human/agent ownership.
struct InteractionSample: Sendable {
  var type: UInt32
  var receivedNS: UInt64
  var eventNS: UInt64 = 0
  var destinationPID: Int32 = 0
  var sourcePID: Int32 = 0
  var sourceTag: Int64 = 0
  var windowUnderPointer: UInt32 = 0
  var x: Double = 0
  var y: Double = 0
  var flags: UInt64 = 0
  var keyCode: Int64 = 0
  var repeated = false
  var button: Int64 = 0
  var eventNumber: Int64 = 0
  var deltaX: Double = 0
  var deltaY: Double = 0
  var scrollX: Double = 0
  var scrollY: Double = 0
  var scrollPhase: Int64 = 0
  var momentumPhase: Int64 = 0
  var continuous = false
  var foregroundPID: Int32 = 0
  var contextNS: UInt64 = 0
  var secureInput = false

  var keyboard: Bool { [10, 11, 12].contains(type) }
  var down: Bool { [1, 3, 25].contains(type) }
  var up: Bool { [2, 4, 26].contains(type) }
  var dragged: Bool { [6, 7, 27].contains(type) }
  var shortcutModifiers: Bool { flags & ((1 << 18) | (1 << 19) | (1 << 20)) != 0 }
}

struct InteractionScopeContext {
  var pid: Int32?
  var windowID: UInt32?
  var frame: CGRect
  var foregroundPID: Int32 = 0
  var transientWindows: Set<UInt32> = []
  var actionIDs: [String] = []
  /// none: destination/focus only; shortcuts: extra modifiers/global shortcuts;
  /// all: every key code in this bounded declared action interval, ambiguous.
  var ambiguousKeys = "shortcuts"
  var retainPointerInFrame = true
}

struct InteractionDecision {
  let reasons: [String]
  let certainty: String
  let actionIDs: [String]
  var retain: Bool { !reasons.isEmpty }
}

/// One instance per source scope; call serially. Separate sources can retain
/// the same event with different evidence. Drag provenance expires and remains
/// ambiguous when a provider multiplexes several agents behind one source PID.
struct InteractionScopePolicy {
  private struct Drag { let since: UInt64; let eventNumber: Int64 }
  private var drags: [String: Drag] = [:]
  /// A missing release must not attach later unrelated pointer work to a drag.
  @discardableResult mutating func invalidateContinuity() -> Int {
    let count=drags.count; drags.removeAll(keepingCapacity:true); return count
  }
  mutating func evaluate(_ event: InteractionSample, _ context: InteractionScopeContext) -> InteractionDecision {
    drags = drags.filter { event.receivedNS >= $0.value.since && event.receivedNS - $0.value.since <= 30_000_000_000 }
    let key = "\(event.sourcePID):\(event.button)"
    let destination = context.pid.map { $0 > 0 && $0 == event.destinationPID } ?? false
    let foreground = context.pid.map { $0 > 0 && $0 == context.foregroundPID } ?? false
    let pointer = event.x.isFinite && event.y.isFinite && context.frame.contains(CGPoint(x:event.x,y:event.y))
    let exactWindow = context.windowID.map { $0 != 0 && $0 == event.windowUnderPointer } ?? false
    let transient = context.transientWindows.contains(event.windowUnderPointer) && event.windowUnderPointer != 0
    let knownOtherWindow = !event.keyboard && event.windowUnderPointer != 0 && context.windowID != nil && !exactWindow && !transient
    var reasons: [String] = []
    var certainty = "candidate"
    if event.keyboard {
      // Secure-input protection takes precedence even if an injected event is
      // still delivered to this passive tap. Retain coverage gaps, not codes.
      if event.secureInput { return InteractionDecision(reasons:[],certainty:"secure_input_omitted",actionIDs:[]) }
      if destination { reasons.append("destination_app"); certainty = "app_delivery_window_unresolved" }
      // A known different destination is stronger than a focus snapshot, which
      // can name an app that did not receive background-injected keys. Unknown
      // destinations still need the foreground fallback for physical input.
      else if foreground && event.destinationPID <= 0 { reasons.append("foreground_app_candidate") }
      if !context.actionIDs.isEmpty && !destination {
        if context.ambiguousKeys == "all" || (context.ambiguousKeys == "shortcuts" && (event.shortcutModifiers || event.type == 12)) {
          reasons.append("declared_action_keyboard_candidate")
        }
      }
    } else {
      if exactWindow && destination { reasons.append("destination_window_clue"); certainty = "window_clue" }
      else if transient { reasons.append("transient_surface_candidate") }
      else if destination && !knownOtherWindow { reasons.append("destination_app_window_unresolved") }
      if pointer && context.retainPointerInFrame && !knownOtherWindow { reasons.append("pointer_in_frame_candidate") }
      if event.down {
        drags.removeValue(forKey:key)
        if !reasons.isEmpty && drags.count < 32 { drags[key] = Drag(since:event.receivedNS,eventNumber:event.eventNumber) }
      }
      if (event.dragged || event.up), let start = drags[key],
         event.dragged || event.eventNumber == start.eventNumber || event.eventNumber == 0 {
        reasons.append("drag_started_in_scope_candidate")
      }
      if event.up { drags.removeValue(forKey:key) }
    }
    // Temporal association adds context; it never upgrades a candidate to an
    // agent identity, or imports outside-scope unmodified typing by default.
    let actions = reasons.isEmpty ? [] : context.actionIDs
    return InteractionDecision(reasons:reasons,certainty:certainty,actionIDs:actions)
  }
}
