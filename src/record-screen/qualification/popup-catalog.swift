import Foundation
import CoreGraphics

// Read-only, one-shot capture diagnosis. No activation, event tap or UI input.
// Run under probe-supervisor.py; WINDOW_ID must identify the owned anchor.
// PID/layer/overlap are candidate clues, never a parent-window relationship.
func frame(_ row: [String: Any]) -> CGRect? {
  guard let bounds = row[kCGWindowBounds as String] as? [String: Any],
        let x = bounds["X"] as? Double, let y = bounds["Y"] as? Double,
        let w = bounds["Width"] as? Double, let h = bounds["Height"] as? Double,
        [x,y,w,h].allSatisfy({ $0.isFinite }), w > 0, h > 0 else { return nil }
  return CGRect(x:x,y:y,width:w,height:h)
}
func rect(_ r: CGRect) -> [String: Double] {
  ["x":r.minX,"y":r.minY,"w":r.width,"h":r.height]
}
do {
  guard CommandLine.arguments.count == 2, let id = UInt32(CommandLine.arguments[1]),
        id > 0 else { throw NSError(domain:"invalid-owned-anchor",code:1) }
  let begin = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
  guard let rows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String:Any]],
        let anchor = rows.first(where:{ ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value == id }),
        let pid = (anchor[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value,
        let bounds = frame(anchor) else { throw NSError(domain:"anchor-unavailable",code:2) }
  let region = bounds.insetBy(dx:-512,dy:-512)
  var candidates = [[String:Any]]()
  for row in rows {
    guard let wid = (row[kCGWindowNumber as String] as? NSNumber)?.uint32Value,
          wid != id, let owner = (row[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value,
          let layer = (row[kCGWindowLayer as String] as? NSNumber)?.intValue,
          let box = frame(row) else { continue }
    let samePID = owner == pid
    let nearbyLayer = layer != 0 && box.intersects(region)
    guard samePID || nearbyLayer else { continue }
    candidates.append(["window_id":wid,"pid":owner,"layer":layer,"frame":rect(box),
      "same_pid":samePID,"nonzero_layer_near_anchor":nearbyLayer,
      "overlaps_anchor":box.intersects(bounds),"relationship":"unverified"])
  }
  let end = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
  let result:[String:Any] = ["schema":"owned-popup-catalog/v1","anchor_window_id":id,
    "anchor_pid":pid,"anchor_frame":rect(bounds),"candidate_region":rect(region),
    "candidates":Array(candidates.prefix(64)),"candidate_count":candidates.count,
    "truncated":candidates.count > 64,"query_begin_ns":String(begin),"query_end_ns":String(end),
    "clock_domain":"CLOCK_UPTIME_RAW","limits":["One asynchronous on-screen observation; not event-time truth",
      "PID, layer and overlap do not prove parent relationship or semantic ownership",
      "Window titles and unrelated normal-window content are omitted"]]
  print(String(data:try JSONSerialization.data(withJSONObject:result,options:[.sortedKeys]),encoding:.utf8)!)
} catch {
  print("{\"error\":\"owned-popup-catalog-unavailable\"}")
  exit(1)
}
