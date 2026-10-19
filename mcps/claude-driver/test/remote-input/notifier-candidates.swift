// Read-only admission evidence for a future remote notifier lifecycle gate.
// This enumerates only the native service bundle; it does not acquire apps,
// connect to a helper, send notifications, launch services or inspect user apps.
import AppKit
import Foundation

let root = "/Users/theo/.local/state/claude-driver/input-teardown-20261018"
let thread = "01a112b1-fbf6-7cb0-8228-ce3e6cb6112d"
guard FileManager.default.homeDirectoryForCurrentUser.path == "/Users/theo",
      ProcessInfo.processInfo.hostName.split(separator: ".").first == "theo-air",
      ProcessInfo.processInfo.environment["SSH_CONNECTION"] != nil,
      let data = try? Data(contentsOf: URL(fileURLWithPath: root + "/owner.json")),
      let owner = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      owner["threadId"] as? String == thread else {
    fputs("remote owner/scope refused\n", stderr)
    exit(1)
}
let expectedApp = root + "/codex-home/computer-use/Codex Computer Use.app"
let rows: [[String: Any]] = NSRunningApplication.runningApplications(
    withBundleIdentifier: "com.openai.sky.CUAService"
).map { app in
    let bundle = app.bundleURL?.standardizedFileURL.path
    let executable = app.executableURL?.standardizedFileURL.path
    return [
        "pid": Int(app.processIdentifier),
        "bundlePath": bundle as Any? ?? NSNull(),
        "executablePath": executable as Any? ?? NSNull(),
        "matchesOwnedBundlePath": bundle == expectedApp,
        "matchesOwnedExecutablePath": executable == expectedApp + "/Contents/MacOS/SkyComputerUseService",
        "terminated": app.isTerminated
    ]
}
let result: [String: Any] = [
    "scope": "remote-readonly-running-service-candidates",
    "expectedBundlePath": expectedApp,
    "candidates": rows,
    "nativeNotificationRequested": false,
    "inputRequested": false
]
let output = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
FileHandle.standardOutput.write(output)
FileHandle.standardOutput.write(Data([10]))
