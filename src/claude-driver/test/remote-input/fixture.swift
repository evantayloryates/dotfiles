// Disposable test window. Observes its own synthetic text only; no global hook,
// network, shell execution, accessibility access or personal document content.
import AppKit
import CryptoKit
import Foundation

@MainActor final class Fixture: NSObject, NSApplicationDelegate, NSTextViewDelegate {
    var window: NSWindow!
    var editor: NSTextView!
    var timer: Timer?
    let directory = Bundle.main.bundleURL.deletingLastPathComponent()

    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 620, height: 320),
                          styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "Claude Driver Input Teardown Fixture"
        window.isReleasedWhenClosed = false
        editor = NSTextView(frame: window.contentView!.bounds)
        editor.autoresizingMask = [.width, .height]
        editor.isRichText = false
        editor.font = NSFont.monospacedSystemFont(ofSize: 18, weight: .regular)
        editor.delegate = self
        editor.setAccessibilityIdentifier("claude-driver-test-editor")
        window.contentView!.addSubview(editor)
        window.makeFirstResponder(editor)
        window.orderFront(nil)
        save()
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                if FileManager.default.fileExists(atPath: self.directory.appendingPathComponent("stop").path) {
                    NSApplication.shared.terminate(nil)
                }
            }
        }
    }

    func textDidChange(_ notification: Notification) { save() }

    func save() {
        let text = editor.string
        let digest = SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
        let state: [String: Any] = ["pid": ProcessInfo.processInfo.processIdentifier,
            "bundleId": Bundle.main.bundleIdentifier ?? "", "characters": text.count,
            "utf8Bytes": text.utf8.count, "sha256": digest,
            "observedAt": ISO8601DateFormatter().string(from: Date())]
        if let bytes = try? JSONSerialization.data(withJSONObject: state, options: [.sortedKeys]) {
            try? bytes.write(to: directory.appendingPathComponent("state.json"), options: .atomic)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = Fixture()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
}
