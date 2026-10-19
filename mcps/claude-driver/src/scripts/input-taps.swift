// Read-only control-plane metadata. No event hook or keyboard capture.
import CoreGraphics
import Foundation
var count: UInt32 = 0
let first = CGGetEventTapList(0, nil, &count)
guard first == .success, count <= 10000 else { exit(1) }
var taps = [CGEventTapInformation](repeating: CGEventTapInformation(), count: Int(count))
let result = CGGetEventTapList(count, &taps, &count)
guard result == .success else { exit(1) }
let rows = taps.prefix(Int(count)).map { tap in
    ["tapId": tap.eventTapID, "ownerPid": tap.tappingProcess,
     "targetPid": tap.processBeingTapped, "enabled": tap.enabled,
     "options": tap.options.rawValue, "mask": String(tap.eventsOfInterest)] as [String: Any]
}
let data = try JSONSerialization.data(withJSONObject: rows)
print(String(data: data, encoding: .utf8)!)
