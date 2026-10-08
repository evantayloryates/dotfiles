// Offline parse/routing checks. No NSApplication, target discovery or capture.
import Foundation

@main struct OptionsTest {
  static func main() throws {
    var checks = 0
    func check(_ ok: Bool, _ name: String) {
      guard ok else { fatalError(name) }; checks += 1
    }
    func parse(_ json: String) throws -> TargetSpec {
      try TargetSpec.parse(JSONSerialization.jsonObject(with: Data(json.utf8)))
    }
    func rejects(_ json: String) {
      do { _ = try parse(json); fatalError("should reject: \(json)") }
      catch { checks += 1 }
    }
    let defaults = try parse(#"{"type":"display"}"#).options
    for base in ["display:1:", "display:1:full", "window:123", "display:1:0,0,800,600"] {
      check(defaults.sourceKey(base, excludedPIDs: [42]) == base, "legacy identity")
    }
    let yes = try parse(#"{"type":"window","window_id":123,"include_child_windows":true}"#).options
    let no = try parse(#"{"type":"window","window_id":123,"include_child_windows":false}"#).options
    check(yes.includeChildWindows == true && no.includeChildWindows == false, "JSON booleans")
    check(yes.sourceKey("window:123", excludedPIDs: []) != no.sourceKey("window:123", excludedPIDs: []), "child settings must not share source")
    check(no.sourceKey("window:123", excludedPIDs: []) != defaults.sourceKey("window:123", excludedPIDs: []), "explicit vs default")
    let excluded = try parse(#"{"type":"rect","x":0,"y":0,"w":800,"h":600,"exclude_apps":["com.test.B","com.test.A","com.test.A"]}"#).options
    check(excluded.excludeApps == ["com.test.A", "com.test.B"], "exact bundles deduplicated and sorted")
    let base = "display:1:0,0,800,600"
    check(excluded.sourceKey(base, excludedPIDs: [7,2,2]) == excluded.sourceKey(base, excludedPIDs: [2,7]), "PID set identity")
    check(excluded.sourceKey(base, excludedPIDs: [2,7]) != excluded.sourceKey(base, excludedPIDs: [2,8]), "restarted helper must not tap old source")
    check(excluded.sourceKey(base, excludedPIDs: [2,7]) != defaults.sourceKey(base, excludedPIDs: [2,7]), "exclusions must not tap baseline")
    for value in ["1", "0", "\"true\"", "null", "{}", "[]"] { rejects("{\"type\":\"display\",\"include_child_windows\":\(value)}") }
    for value in ["\"com.test.A\"", "[1]", "[\"bad bundle\"]", "[\"\"]", "[\"../path\"]", "null"] { rejects("{\"type\":\"display\",\"exclude_apps\":\(value)}") }
    rejects(#"{"type":"window","window_id":123,"exclude_apps":["com.test.A"]}"#)
    let many = Array(repeating: "com.test.A", count: 9)
    let input: [String:Any] = ["type":"display", "exclude_apps":many]
    do { _ = try TargetSpec.parse(input); fatalError("bundle cap") } catch { checks += 1 }
    print("{\"passed\":\(checks),\"scope\":\"offline target parsing and source identity; no live SDK capture\"}")
  }
}
