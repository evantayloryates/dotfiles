import Foundation

@main struct ExportTest {
  static func main() async throws {
    let arguments = CommandLine.arguments
    guard arguments.count == 3 else { fatalError("export-test SOURCE VIDEO_OUTPUT_DIRECTORY") }
    var checks = 0
    func check(_ value: Bool, _ message: String) { guard value else { fatalError(message) }; checks += 1 }
    for (from, to, width, rate) in [(Double.nan, 1.0, 640.0, 12.0), (-1, 1, 640, 12), (1, 0, 640, 12), (0, 1, 1, 12), (0, 1, 640, 12.5), (0, 1, 640, Double.infinity)] {
      do { _ = try Export.Plan(format: "mp4", from: from, to: to, maxWidth: width, fps: rate); fatalError("invalid input admitted") }
      catch let e as RPCError { check(e.code == "bad_params", "invalid finite/grid parameters refused") }
    }
    let draft = try Export.Plan(format: "mp4", effort: "draft", from: 0, to: 1, maxWidth: nil, fps: nil)
    check(draft.backend == "software" && draft.fps == 12 && draft.maxWidth == 640, "draft defaults bounded software")
    let native = try Export.Plan(format: "mp4", effort: "full", from: 0, to: 1, maxWidth: nil, fps: nil)
    check(native.backend == "hardware" && native.fps == 60 && native.maxWidth == nil, "full fidelity defaults")
    let decimal = try Export.Plan(format: "mp4", from: 0.07, to: 0.14, maxWidth: nil, fps: 100)
    check(try decimal.tick(0.07) == 7 && decimal.tick(0.14) == 14, "decimal grid boundaries do not shift a frame")
    let parent = try await Export.inspect(arguments[1])
    check(!parent.packets.isEmpty && parent.width > 0, "actual parent packet inspection")
    var results: [[String: Any]] = []
    for (name, format, from, to, width, rate) in [
      ("draft", "mp4", 0.133, 2.21, 64.0, 12.0),
      ("precise", "mp4", 0.51, 1.88, 96, 30),
      ("held", "mp4", 0.25, 0.65, 64, 50),
      ("palette", "gif", 0.133, 2.21, 64, 12),
      ("gif-grid", "gif", 0.17, 1.81, 64, 13),
      ("decimal-grid", "mp4", 0.07, 0.14, 64, 100)
    ] {
      let path = arguments[2] + "/" + name + "." + format
      let result = try await Export.run(video: arguments[1], out: path, format: format, from: from, to: to,
        maxWidth: width, fps: rate, effort: "draft", backend: "software", parentIdentity: ["recording_id": "synthetic-vfr"])
      check((result["bytes"] as? Int ?? 0) > 0, "actual derivative exists")
      let info = result["derivative_source"] as! [String: Any]
      let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: info["path"] as! String))) as! [String: Any]
      check(manifest["schema"] as? String == "record-screen-derivative/v1", "saved derivative map")
      check((manifest["frames"] as? [[String: Any]])?.count == info["frames"] as? Int, "published frame count")
      do {
        _ = try await Export.run(video: arguments[1], out: path, format: format, from: from, to: to, maxWidth: width, fps: rate)
        fatalError("reviewed output overwrite must refuse")
      } catch let e as RPCError { check(e.code == "bad_params", "immutable export name") }
      results.append(result)
    }
    check(ManagedCommand.status()["pending"] as? Bool == false, "no child remains after derivative validation")
    let value: [String: Any] = ["passed": checks, "scope": "software export, actual packets, bounded invalid input, immutable publication; pixel proof separate", "exports": results]
    print(String(data: jsonData(value)!, encoding: .utf8)!)
  }
}
