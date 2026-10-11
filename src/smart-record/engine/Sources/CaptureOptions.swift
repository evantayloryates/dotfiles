import Foundation
import CoreFoundation

/// Optional capture controls. An absent child setting preserves the SDK's
/// current default; no implicit helper exclusion is enabled for old callers.
struct CaptureOptions {
  static let contractVersion = 1
  var includeChildWindows: Bool? = nil
  var excludeApps: [String] = []
  var includeApps: [String] = []
  var identityBundles: [String] { includeApps.isEmpty ? excludeApps : includeApps }
  var identityRole: String { includeApps.isEmpty ? "exclusion" : "inclusion" }
  var configured: Bool { includeChildWindows != nil || !excludeApps.isEmpty || !includeApps.isEmpty }

  static func parse(_ parameters: [String: Any]) throws -> CaptureOptions {
    var result = CaptureOptions()
    if let raw = parameters["include_child_windows"] {
      guard CFGetTypeID(raw as CFTypeRef) == CFBooleanGetTypeID(), let value = raw as? Bool else {
        throw RPCError.badParams("include_child_windows must be a boolean")
      }
      result.includeChildWindows = value
    }
    if let raw = parameters["exclude_apps"] {
      guard let values = raw as? [String], values.count <= 8,
            values.allSatisfy({ !$0.isEmpty && $0.count <= 256 && $0.range(of: "^[A-Za-z0-9][A-Za-z0-9.-]*$", options: .regularExpression) != nil }) else {
        throw RPCError.badParams("exclude_apps must contain at most 8 exact bundle identifiers")
      }
      result.excludeApps = Array(Set(values)).sorted()
    }
    if let raw = parameters["include_apps"] {
      guard let values = raw as? [String], values.count == 1,
            values[0].count <= 256,
            values[0].range(of: "^[A-Za-z0-9][A-Za-z0-9.-]*$", options: .regularExpression) != nil else {
        throw RPCError.badParams("include_apps requires exactly one exact bundle identifier")
      }
      guard result.excludeApps.isEmpty else { throw RPCError.badParams("include_apps and exclude_apps cannot be combined") }
      result.includeApps = values
    }
    return result
  }

  /// Resolved PIDs matter: a restarted helper must not reuse its old stream.
  func identity(excludedPIDs: [Int32], includedPIDs: [Int32] = []) -> String {
    guard configured else { return "" }
    let children = includeChildWindows.map { $0 ? "true" : "false" } ?? "default"
    let old = "children=\(children);apps=\(excludeApps.joined(separator: ","));pids=\(Set(excludedPIDs).sorted().map(String.init).joined(separator: ","))"
    return includeApps.isEmpty ? old : old + ";include=\(includeApps.joined(separator: ","));included-pids=\(Set(includedPIDs).sorted().map(String.init).joined(separator: ","))"
  }

  func sourceKey(_ base: String, excludedPIDs: [Int32], includedPIDs: [Int32] = []) -> String {
    let suffix = identity(excludedPIDs: excludedPIDs, includedPIDs: includedPIDs)
    return suffix.isEmpty ? base : "\(base)|\(suffix)"
  }
}
