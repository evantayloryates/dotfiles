import Foundation
import CoreGraphics

@main struct KeyboardRelevanceTest {
  static func main() {
    var checks = 0
    func check(_ condition: Bool, _ label: String) {
      precondition(condition, label); checks += 1
    }
    var context = InteractionScopeContext(pid: 100, windowID: 10, frame: .zero)
    context.foregroundPID = 100
    context.actionIDs = ["declared-action"]
    var event = InteractionSample(type: 10, receivedNS: 100, destinationPID: 200, keyCode: 8)
    var policy = InteractionScopePolicy()
    check(!policy.evaluate(event, context).retain, "known other destination excludes unmodified key down despite foreground")
    event.type = 11
    check(!policy.evaluate(event, context).retain, "known other destination excludes unmodified key up")
    event.type = 10; event.flags = 1 << 20
    var result = policy.evaluate(event, context)
    check(result.reasons == ["declared_action_keyboard_candidate"], "other-app shortcut remains bounded candidate")
    check(result.certainty == "candidate" && result.actionIDs == context.actionIDs, "candidate never becomes ownership")
    event.type = 12; event.flags = 0
    check(policy.evaluate(event, context).retain, "modifier release survives action for chord completeness")
    context.actionIDs = []
    check(!policy.evaluate(event, context).retain, "other-app modifier requires declared action")
    event.type = 10; event.flags = 0; event.destinationPID = 0
    check(policy.evaluate(event, context).reasons == ["foreground_app_candidate"], "unknown physical destination retains foreground fallback")
    event.destinationPID = 100; event.windowUnderPointer = 20
    result = policy.evaluate(event, context)
    check(result.retain && result.certainty == "app_delivery_window_unresolved", "target app keys survive without window/text input")
    event.secureInput = true
    check(!policy.evaluate(event, context).retain, "protected input remains omitted")
    event.secureInput = false; event.destinationPID = 200; context.actionIDs = ["declared-action"]
    context.ambiguousKeys = "all"
    check(policy.evaluate(event, context).reasons == ["declared_action_keyboard_candidate"], "explicit all can retain known other keys as candidates")
    context.ambiguousKeys = "none"; event.flags = 1 << 20
    check(!policy.evaluate(event, context).retain, "none excludes known other shortcut")
    event.destinationPID = 100
    check(policy.evaluate(event, context).retain, "none never discards delivered target app keys")
    print("{\"passed\":\(checks),\"scope\":\"destination-aware keyboard fallback and preserved configurable candidates\"}")
  }
}
