// Actual Review.frames path; no capture, UI, native engine or permission change.
import Foundation
import CoreGraphics

@main struct RetainedFrameTest {
  static func main() async throws {
    let args = CommandLine.arguments
    guard args.count == 4 else { fatalError("retained-frame-test VIDEO FRESH_OUTPUT comma-separated-seconds") }
    let times = args[3].split(separator: ",").compactMap { Double($0) }
    guard !times.isEmpty, times.count <= 12, !FileManager.default.fileExists(atPath: args[2]) else { fatalError("Fresh output and1–12 times required") }
    let results = try await Review.frames(video: args[1], at: times, outDir: args[2], maxWidth: 640)
    for r in results {
      precondition(r["frame_time"] is [String:Any])
      let checks = r["pixel_checks"] as! [String:Any]
      precondition(checks["luma_mean"] is Double && checks["luma_sd"] is Double && checks["looks_blank"] is Bool)
      precondition(r["pixel_checks_qualification"] is String)
    }
    let json = try JSONSerialization.data(withJSONObject: ["passed":true,"frames":results], options: [.prettyPrinted,.sortedKeys])
    FileHandle.standardOutput.write(json)
  }
}
