import Foundation

/// Discovery scope only. Membership does not establish semantic parenthood,
/// input ownership, capturability or pixel presence.
enum WindowInventoryPolicy {
  static func includes(layer: Int, width: Double, height: Double, bundle: String,
                       title: String, onScreen: Bool, ownProcess: Bool,
                       includeOffscreen: Bool, includeTransients: Bool) -> Bool {
    guard !ownProcess, width.isFinite, height.isFinite,
          includeOffscreen || onScreen else { return false }
    if includeTransients {
      // Desktop/background layers remain excluded. Floating menus/panels and
      // small/helper surfaces can be discovered with explicit opt-in.
      return layer >= 0 && width >= 1 && height >= 1
    }
    return layer == 0 && width >= 100 && height >= 60 &&
      !bundle.contains(".xpc.") && (onScreen || !title.isEmpty)
  }
}
