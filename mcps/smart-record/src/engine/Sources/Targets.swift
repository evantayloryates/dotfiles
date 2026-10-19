import AppKit
import ScreenCaptureKit

/// What an agent points the engine at. All geometry is in global points with
/// the origin at the top-left of the main display and y growing downward (the
/// same space as Hammerspoon's hs.window:frame() and ScreenCaptureKit).
///
///   {"type": "display", "display_id": 1}          display_id omitted = main display
///   {"type": "rect", "x": 0, "y": 0, "w": 800, "h": 600}
///   {"type": "window", "window_id": 1234}
///   {"type": "window", "app": "com.google.Chrome", "title": "PR #42"}   app = bundle id or name
struct TargetSpec {
  enum Surface {
    case display(CGDirectDisplayID?)
    case rect(CGRect)
    case window(id: CGWindowID?, app: String?, title: String?)
  }
  let surface: Surface
  let options: CaptureOptions

  static func parse(_ any: Any?) throws -> TargetSpec {
    guard let p = any as? [String: Any], let type = p["type"] as? String else {
      throw RPCError.badParams("target must be an object with a type: display, rect or window")
    }
    let selectors:[String:Set<String>] = ["display":["display_id"],"rect":["x","y","w","h"],"window":["window_id","app","title"]]
    if let names=selectors[type] {
      try RPCNumber.fields(p,allowed:names.union(["type","include_child_windows","exclude_apps","include_apps"]),label:"target \(type)")
    }
    func num(_ k: String,min:Double = -10_000_000,max:Double = 10_000_000) throws -> Double? {
      try RPCNumber.optional(p,k,min:min,max:max)
    }
    func identifier(_ key:String) throws -> UInt32? {
      try RPCNumber.optional(p,key,min:1,max:Double(UInt32.max),integer:true).map { UInt32($0) }
    }
    let options = try CaptureOptions.parse(p)
    switch type {
    case "display":
      return TargetSpec(surface: .display(try identifier("display_id")), options: options)
    case "rect":
      guard let x = try num("x"), let y = try num("y"), let w = try num("w",min:2,max:131072), let h = try num("h",min:2,max:131072) else {
        throw RPCError.badParams("rect target needs x, y, w, h in points (w and h at least 2)")
      }
      return TargetSpec(surface: .rect(CGRect(x: x, y: y, width: w, height: h)), options: options)
    case "window":
      let id = try identifier("window_id")
      try RPCNumber.string(p,"app");try RPCNumber.string(p,"title")
      let app = p["app"] as? String, title = p["title"] as? String
      for value in [app,title].compactMap({$0}) where value.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {
        throw RPCError.badParams("window app/title selectors must be nonempty; omit unused selectors")
      }
      guard id != nil || app != nil || title != nil else {
        throw RPCError.badParams("window target needs window_id, or app and/or title")
      }
      guard options.excludeApps.isEmpty && options.includeApps.isEmpty else {
        throw RPCError.badParams("include_apps and exclude_apps are supported only on display and rect targets")
      }
      return TargetSpec(surface: .window(id: id, app: app, title: title), options: options)
    default:
      throw RPCError.badParams("unknown target type \(type); use display, rect or window")
    }
  }

  static func matchesWindow(app:String?,title:String?,bundle:String?,name:String?,windowTitle:String?) -> Bool {
    if let a=app?.lowercased() {
      let bid=bundle?.lowercased() ?? "",label=name?.lowercased() ?? ""
      guard bid==a || label==a || label.contains(a) else { return false }
    }
    if let t=title?.lowercased(),!(windowTitle ?? "").lowercased().contains(t) { return false }
    return true
  }
}

/// A target resolved against what is on screen right now.
struct ResolvedTarget {
  let kind: String
  let filter: SCContentFilter
  let display: SCDisplay
  /// Global points actually captured.
  let frame: CGRect
  /// Region of the display, in display-local points (display and rect targets).
  let sourceRect: CGRect?
  let scale: Double
  let window: SCWindow?
  var warnings: [String]
  /// Whether the filter already excludes the engine's own windows; part of the
  /// key so a stream built before the first outline existed gets rebuilt.
  var excludesSelf = false
  var captureOptions = CaptureOptions()
  var excludedApplications: [SCRunningApplication] = []
  var includedApplications: [SCRunningApplication] = []
  var identityApplications: [SCRunningApplication] { includedApplications.isEmpty ? excludedApplications : includedApplications }
  var inputScopePID: Int32? { window?.owningApplication?.processID ?? (includedApplications.count == 1 ? includedApplications[0].processID : nil) }

  /// Identity of the content filter. Same key: the viewfinder only needs a new
  /// area or size (sourceRect lives in the stream configuration).
  var key: String {
    let base = window.map { "window:\($0.windowID)" } ?? "display:\(display.displayID):\(excludesSelf ? "x" : "")"
    return captureOptions.sourceKey(base, excludedPIDs: excludedApplications.map { $0.processID }, includedPIDs: includedApplications.map { $0.processID })
  }

  /// Source coverage AND optional filter/configuration identity, used to tap
  /// recordings. Unconfigured callers retain their old keys exactly.
  var areaKey: String {
    let base = window.map { "window:\($0.windowID)" } ?? "display:\(display.displayID):\(sourceRect.map { "\(Int($0.minX)),\(Int($0.minY)),\(Int($0.width)),\(Int($0.height))" } ?? "full")"
    return captureOptions.sourceKey(base, excludedPIDs: excludedApplications.map { $0.processID }, includedPIDs: includedApplications.map { $0.processID })
  }

  var pixelSize: CGSize { CGSize(width: frame.width * scale, height: frame.height * scale) }

  func describe() -> [String: Any] {
    var d: [String: Any] = [
      "kind": kind,
      "display_id": Int(display.displayID),
      "frame": rectDict(frame),
      "scale": scale,
      "pixels": ["w": Int(pixelSize.width), "h": Int(pixelSize.height)],
      "warnings": warnings,
      "excludes_engine_windows": excludesSelf,
      "capture_options": [
        "include_child_windows_requested": captureOptions.includeChildWindows.map { $0 as Any } ?? NSNull(),
        "include_child_windows_effective": configuration(maxWidth: nil).includeChildWindows,
        "exclude_apps": captureOptions.excludeApps,
        "include_apps": captureOptions.includeApps,
        "resolved_inclusions": includedApplications.map { ["bundle_id": $0.bundleIdentifier, "pid": Int($0.processID)] as [String: Any] },
        "resolved_exclusions": excludedApplications.map { ["bundle_id": $0.bundleIdentifier, "pid": Int($0.processID)] as [String: Any] },
      ],
    ]
    if let w = window { d["window"] = windowDict(w) }
    if !includedApplications.isEmpty {
      d["application_filter"] = ["scope_pid": inputScopePID as Any? ?? NSNull(), "crop_policy": "fixed display region; no window tracking or automatic overflow expansion", "identity_policy": "interrupt on observed app identity change; no automatic replacement", "limits": "Same-app user actions/windows can change pixels. Hidden/minimized/off-Space drawing and menus require actual source qualification."]
    }
    return d
  }

  /// Stream/screenshot configuration for this target, scaled so the longest
  /// side is at most maxPixels (nil = native resolution).
  func configuration(maxWidth: Int?, pixelFormat: OSType = kCVPixelFormatType_32BGRA, showsCursor: Bool = false) -> SCStreamConfiguration {
    let c = SCStreamConfiguration()
    if let r = sourceRect { c.sourceRect = r }
    var w = pixelSize.width, h = pixelSize.height
    if let m = maxWidth, w > Double(m) { h = h * Double(m) / w; w = Double(m) }
    c.width = max(2, Int(w.rounded()) & ~1)
    c.height = max(2, Int(h.rounded()) & ~1)
    c.pixelFormat = pixelFormat
    c.showsCursor = showsCursor
    c.colorSpaceName = CGColorSpace.sRGB
    c.ignoreShadowsSingleWindow = true
    if let children = captureOptions.includeChildWindows { c.includeChildWindows = children }
    return c
  }
}

/// JSON-safe: a null or infinite rect would crash JSONSerialization, so it
/// becomes an empty object.
func rectDict(_ r: CGRect) -> [String: Any] {
  guard !r.isNull, !r.isInfinite, r.origin.x.isFinite, r.origin.y.isFinite else { return [:] }
  return ["x": r.origin.x, "y": r.origin.y, "w": r.width, "h": r.height]
}

func windowDict(_ w: SCWindow) -> [String: Any] {
  let app = w.owningApplication
  return [
    "window_id": Int(w.windowID),
    "title": w.title ?? "",
    "app": app?.applicationName ?? "",
    "bundle_id": app?.bundleIdentifier ?? "",
    "pid": Int(app?.processID ?? 0),
    "frame": rectDict(w.frame),
    "on_screen": w.isOnScreen,
    "layer": w.windowLayer,
  ]
}

func displayScale(_ id: CGDirectDisplayID) -> Double {
  guard let m = CGDisplayCopyDisplayMode(id), m.width > 0 else { return 1 }
  return Double(m.pixelWidth) / Double(m.width)
}

enum Targets {
  /// Shareable content including off-screen windows (other Spaces), so window
  /// targets on a Space you aren't viewing still resolve.
  /// Cached for a moment: listing costs 35–60 ms and agents verify in bursts.
  /// Concurrent callers share one in-flight fetch. `fresh: true` bypasses the
  /// cache (used when a lookup misses).
  static func content(fresh: Bool = false) async throws -> SCShareableContent {
    do {
      return try await ContentCache.shared.content(fresh: fresh)
    } catch let error as RPCError {
      throw error
    } catch {
      throw RPCError(code: "capture_unavailable", message: "ScreenCaptureKit refused: \(error.localizedDescription). Check engine status, permission and target visibility before retrying.")
    }
  }

  /// The engine's own windows (frame outlines) never appear in captures.
  static func ownApps(_ content: SCShareableContent) -> [SCRunningApplication] {
    content.applications.filter { $0.processID == getpid() }
  }

  static func resolve(_ spec: TargetSpec, content: SCShareableContent) throws -> ResolvedTarget {
    var inclusions: [SCRunningApplication] = []
    if let bundle = spec.options.includeApps.first {
      inclusions = content.applications.filter {
        guard $0.bundleIdentifier == bundle, $0.processID != getpid(), let app = NSRunningApplication(processIdentifier: $0.processID) else { return false }
        return !app.isTerminated && app.bundleIdentifier == bundle
      }
      guard inclusions.count == 1 else {
        throw RPCError(code: "target_not_found", message: "included app \(bundle) needs one current shareable process; absent or ambiguous identity is not captured")
      }
    }
    var exclusions = ownApps(content)
    for bundle in spec.options.excludeApps {
      let applications = content.applications.filter {
        guard $0.bundleIdentifier == bundle, let running = NSRunningApplication(processIdentifier: $0.processID) else { return false }
        return !running.isTerminated && running.bundleIdentifier == bundle
      }
      guard !applications.isEmpty else {
        throw RPCError(code: "target_not_found", message: "excluded app \(bundle) is not available to ScreenCaptureKit; resolve its current identity before capture")
      }
      for application in applications where !exclusions.contains(where: { $0.processID == application.processID }) { exclusions.append(application) }
    }
    switch spec.surface {
    case .display(let id):
      let want = id ?? CGMainDisplayID()
      guard let d = content.displays.first(where: { $0.displayID == want }) else {
        throw RPCError(code: "target_not_found", message: "no display \(want); displays: \(content.displays.map { $0.displayID })")
      }
      let filter = inclusions.isEmpty ? SCContentFilter(display: d, excludingApplications: exclusions, exceptingWindows: []) : SCContentFilter(display: d, including: inclusions, exceptingWindows: [])
      return ResolvedTarget(kind: "display", filter: filter, display: d, frame: d.frame, sourceRect: nil,
                            scale: displayScale(d.displayID), window: nil, warnings: [], excludesSelf: !ownApps(content).isEmpty,
                            captureOptions: spec.options, excludedApplications: inclusions.isEmpty ? exclusions : [], includedApplications: inclusions)

    case .rect(let r):
      let center = CGPoint(x: r.midX, y: r.midY)
      guard let d = content.displays.first(where: { $0.frame.contains(center) })
              ?? content.displays.max(by: { $0.frame.intersection(r).area < $1.frame.intersection(r).area }),
            !d.frame.intersection(r).isNull else {
        throw RPCError(code: "target_not_found", message: "rect \(rectDict(r)) is not on any display")
      }
      var warnings: [String] = []
      let clipped = r.intersection(d.frame)
      if clipped.size != r.size {
        warnings.append("rect extends past display \(d.displayID); captured only the part on it: \(rectDict(clipped))")
      }
      let local = clipped.offsetBy(dx: -d.frame.minX, dy: -d.frame.minY)
      let filter = inclusions.isEmpty ? SCContentFilter(display: d, excludingApplications: exclusions, exceptingWindows: []) : SCContentFilter(display: d, including: inclusions, exceptingWindows: [])
      return ResolvedTarget(kind: "rect", filter: filter, display: d, frame: clipped, sourceRect: local,
                            scale: displayScale(d.displayID), window: nil, warnings: warnings, excludesSelf: !ownApps(content).isEmpty,
                            captureOptions: spec.options, excludedApplications: inclusions.isEmpty ? exclusions : [], includedApplications: inclusions)

    case .window(let id, let app, let title):
      let w = try findWindow(id: id, app: app, title: title, content: content)
      // Content may be cached for a moment; geometry and visibility come live.
      let live = liveWindowState(w.windowID)
      let frame = live?.frame ?? w.frame
      let onScreen = live?.onScreen ?? w.isOnScreen
      let d = content.displays.first(where: { $0.frame.contains(CGPoint(x: frame.midX, y: frame.midY)) })
        ?? content.displays.first(where: { $0.displayID == CGMainDisplayID() }) ?? content.displays[0]
      var warnings: [String] = []
      let pid = w.owningApplication?.processID ?? 0
      if let running = NSRunningApplication(processIdentifier: pid), running.isHidden {
        warnings.append("the app is hidden, so the window renders nothing; unhide it or recording will be empty")
      } else if !onScreen {
        warnings.append("window is not on screen (another Space or minimized); verify actual source pixels. Off-Space rendering is app-dependent; hidden/minimized content may be absent")
      }
      return ResolvedTarget(kind: "window", filter: SCContentFilter(desktopIndependentWindow: w), display: d,
                            frame: frame, sourceRect: nil, scale: displayScale(d.displayID), window: w, warnings: warnings,
                            captureOptions: spec.options)
    }
  }

  static func findWindow(id: CGWindowID?, app: String?, title: String?, content: SCShareableContent) throws -> SCWindow {
    if let id {
      guard let w = content.windows.first(where: { $0.windowID == id }) else {
        throw RPCError(code: "target_not_found", message: "no window \(id); it may have closed. Use windows.list to find it again")
      }
      guard TargetSpec.matchesWindow(app:app,title:title,bundle:w.owningApplication?.bundleIdentifier,name:w.owningApplication?.applicationName,windowTitle:w.title) else {
        throw RPCError(code:"target_mismatch",message:"window \(id) does not match the supplied app/title selectors; inspect its current metadata before choosing a target")
      }
      return w
    }
    let matches = listWindows(app: app, title: title, content: content)
    guard let best = matches.first else {
      throw RPCError(code: "target_not_found", message: "no window matches app=\(app ?? "*") title=\(title ?? "*"); use windows.list")
    }
    return best
  }

  /// Normal app windows, front to back as macOS orders them, on-screen first.
  static func listWindows(app: String?, title: String?, content: SCShareableContent, includeOffscreen: Bool = true,
                          includeTransients: Bool = false) -> [SCWindow] {
    let order = frontToBackOrder()
    let me = getpid()
    return content.windows.filter { w in
      guard WindowInventoryPolicy.includes(layer: w.windowLayer, width: w.frame.width, height: w.frame.height,
        bundle: w.owningApplication?.bundleIdentifier ?? "", title: w.title ?? "", onScreen: w.isOnScreen,
        ownProcess: w.owningApplication?.processID == me, includeOffscreen: includeOffscreen,
        includeTransients: includeTransients) else { return false }
      return TargetSpec.matchesWindow(app:app,title:title,bundle:w.owningApplication?.bundleIdentifier,name:w.owningApplication?.applicationName,windowTitle:w.title)
    }.sorted { a, b in
      if a.isOnScreen != b.isOnScreen { return a.isOnScreen }
      return (order[a.windowID] ?? Int.max) < (order[b.windowID] ?? Int.max)
    }
  }

  /// About a millisecond, versus 35–60 ms for a full ScreenCaptureKit listing.
  static func liveWindowState(_ id: CGWindowID) -> (frame: CGRect, onScreen: Bool)? {
    // .optionIncludingWindow also finds windows on Spaces you aren't viewing.
    guard let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], id) as? [[String: Any]],
          let info = list.first(where: { ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value == id }),
          let b = info[kCGWindowBounds as String] as? NSDictionary,
          let r = CGRect(dictionaryRepresentation: b) else { return nil }
    return (r, (info[kCGWindowIsOnscreen as String] as? Bool) ?? false)
  }

  private static func frontToBackOrder() -> [CGWindowID: Int] {
    guard let list = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [:] }
    var order: [CGWindowID: Int] = [:]
    for (i, w) in list.enumerated() {
      if let n = w[kCGWindowNumber as String] as? NSNumber { order[CGWindowID(n.uint32Value)] = i }
    }
    return order
  }
}

actor ContentCache {
  static let shared = ContentCache()
  private var cached: SCShareableContent?
  private var at: UInt64 = 0
  private var inflight: CaptureDeadline<SCShareableContent>?
  private let ttlNs: UInt64 = 2_000_000_000

  func content(fresh: Bool) async throws -> SCShareableContent {
    if !fresh, let c = cached, uptimeNs() - at < ttlNs { return c }
    // Do not start another SDK request while a timed-out producer is still
    // running. Repeated callers fail fast on the same quarantined operation.
    let operation: CaptureDeadline<SCShareableContent>
    if let pending = inflight, !pending.producerFinished {
      operation = pending
    } else {
      operation = CaptureDeadline(seconds: 3, label: "shareable content discovery") {
        try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
      }
      inflight = operation
    }
    let c = try await operation.value()
    if inflight === operation {
      cached = c
      at = uptimeNs()
      inflight = nil
    }
    return c
  }

  func invalidate() { cached = nil }

  var diagnostics: [String: Any] {
    ["inflight": inflight != nil && !inflight!.producerFinished,
     "quarantined": inflight?.timedOut == true && inflight?.producerFinished == false,
     "waiting": inflight?.waiterCount ?? 0, "deadline_s": 3]
  }
}

extension CGRect {
  var area: CGFloat { isNull ? 0 : width * height }
}
