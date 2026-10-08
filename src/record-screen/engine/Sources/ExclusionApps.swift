import AppKit

/// Launch/termination notifications omit LSUIElement/background applications.
/// KVO of runningApplications covers those applications too. This observer is
/// initialized on the engine's main thread before accepting capture requests.
final class ExclusionApps: @unchecked Sendable {
  static let shared=ExclusionApps()
  let tracker=ExclusionIdentityTracker()
  private var observation:NSKeyValueObservation?
  init() {
    observation=NSWorkspace.shared.observe(\.runningApplications,options:[.initial]) {[weak self] workspace,_ in
      guard let self else{return}
      let at=uptimeNs()
      var apps:[String:Set<ExclusionAppIdentity>]=[:]
      // Indexed KVO changes can contain only inserted/removed apps. Always
      // read the atomic full list, not change.newValue as a replacement list.
      for app in workspace.runningApplications {
        guard let bundle=app.bundleIdentifier,!app.isTerminated else{continue}
        apps[bundle,default:[]].insert(ExclusionAppIdentity(pid:app.processIdentifier,launch:app.launchDate.map{String($0.timeIntervalSince1970)}))
      }
      self.tracker.observe(apps,at:at)
    }
  }
}
