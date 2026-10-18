// Disposable test window. Observes its own synthetic text only; no global hook,
// network, shell execution, accessibility access or personal document content.
import AppKit
import CryptoKit
import Foundation
import CoreGraphics

// Diagnostic observation is confined to events delivered to this disposable
// editor. No global monitor or raw typed characters are recorded.
@MainActor final class ObservedTextView: NSTextView {
    weak var fixture: Fixture?
    override func keyDown(with event: NSEvent) {
        fixture?.keyEvent(event, phase: "keyDown-before", characters: string.count)
        super.keyDown(with: event)
    }
    override func keyUp(with event: NSEvent) {
        fixture?.keyEvent(event, phase: "keyUp", characters: string.count)
        super.keyUp(with: event)
    }
    override func insertText(_ insertString: Any, replacementRange: NSRange) {
        let text = (insertString as? String) ?? (insertString as? NSAttributedString)?.string ?? ""
        let before = string.count
        super.insertText(insertString, replacementRange: replacementRange)
        fixture?.record(["phase": "insert", "before": before, "after": string.count,
                         "insertedCharacters": text.count, "insertedUtf8Bytes": text.utf8.count,
                         "insertedSha256": Fixture.digest(text)])
    }
}

@MainActor final class Fixture: NSObject, NSApplicationDelegate, NSTextViewDelegate, NSWindowDelegate {
    var window: NSWindow!
    var editor: NSTextView!
    var timer: Timer?
    var events: FileHandle?
    var eventSequence = 0
    var bufferedEvents: [[String: Any]] = []
    var droppedEvents = 0
    let directory = Bundle.main.bundleURL.deletingLastPathComponent()

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let path = ProcessInfo.processInfo.environment["CLAUDE_DRIVER_FIXTURE_EVENT_LOG"],
           path.hasPrefix("/Users/theo/.local/state/claude-driver/input-teardown-20261018/evidence/owner-native-"),
           path.hasSuffix("/fixture-events.jsonl"), !path.contains("/../"),
           !FileManager.default.fileExists(atPath: path),
           FileManager.default.createFile(atPath: path, contents: nil, attributes: [.posixPermissions: 0o600]) {
            events = try? FileHandle(forWritingTo: URL(fileURLWithPath: path))
        }
        let mainMenu = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu(title: "Fixture")
        appMenu.addItem(withTitle: "Quit Fixture", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu; mainMenu.addItem(appItem)
        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editItem.submenu = editMenu; mainMenu.addItem(editItem)
        NSApp.mainMenu = mainMenu
        window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 620, height: 320),
                          styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "Claude Driver Input Teardown Fixture"
        window.isReleasedWhenClosed = false
        let observed = ObservedTextView(frame: window.contentView!.bounds)
        observed.fixture = self
        editor = observed
        editor.autoresizingMask = [.width, .height]
        editor.isRichText = false
        editor.font = NSFont.monospacedSystemFont(ofSize: 18, weight: .regular)
        editor.delegate = self
        editor.setAccessibilityIdentifier("claude-driver-test-editor")
        window.contentView!.addSubview(editor)
        window.makeFirstResponder(editor)
        window.delegate = self
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
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

    func windowDidBecomeKey(_ notification: Notification) { if editor != nil { save() } }
    func windowDidResignKey(_ notification: Notification) { if editor != nil { save() } }
    func applicationDidBecomeActive(_ notification: Notification) { if editor != nil { save() } }
    func applicationDidResignActive(_ notification: Notification) { if editor != nil { save() } }
    static func digest(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    func record(_ metadata: [String: Any]) {
        guard events != nil else { return }
        eventSequence += 1
        guard bufferedEvents.count < 50_000 else { droppedEvents += 1; return }
        var row = metadata
        row["sequence"] = eventSequence
        row["pid"] = ProcessInfo.processInfo.processIdentifier
        row["uptime"] = ProcessInfo.processInfo.systemUptime
        row["epochSeconds"] = Date().timeIntervalSince1970
        bufferedEvents.append(row)
    }
    func applicationWillTerminate(_ notification: Notification) {
        guard let events else { return }
        var batch = Data()
        let summary: [String: Any] = ["phase": "log-summary", "pid": ProcessInfo.processInfo.processIdentifier,
            "recordedEvents": bufferedEvents.count, "droppedEvents": droppedEvents,
            "epochSeconds": Date().timeIntervalSince1970]
        for row in bufferedEvents + [summary] {
            if let bytes = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) {
                batch.append(bytes); batch.append(10)
            }
            if batch.count >= 256 * 1024 { try? events.write(contentsOf: batch); batch.removeAll(keepingCapacity: true) }
        }
        if !batch.isEmpty { try? events.write(contentsOf: batch) }
        try? events.close()
        self.events = nil
    }
    func keyEvent(_ event: NSEvent, phase: String, characters: Int) {
        var row: [String: Any] = ["phase": phase, "characters": characters,
            "eventTimestamp": event.timestamp,
            "keyCode": event.keyCode, "isARepeat": event.isARepeat,
            "modifiers": event.modifierFlags.rawValue,
            "eventCharactersSha256": Self.digest(event.characters ?? "")]
        if let cg = event.cgEvent {
            row["cgTimestamp"] = String(cg.timestamp)
            row["sourcePid"] = cg.getIntegerValueField(.eventSourceUnixProcessID)
            row["sourceState"] = cg.getIntegerValueField(.eventSourceStateID)
            row["sourceUserData"] = String(cg.getIntegerValueField(.eventSourceUserData))
        }
        record(row)
    }
    func textDidChange(_ notification: Notification) {
        record(["phase": "text-change", "characters": editor.string.count,
                "sha256": Self.digest(editor.string)])
        save()
    }

    func save() {
        let text = editor.string
        let digest = SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
        let state: [String: Any] = ["pid": ProcessInfo.processInfo.processIdentifier,
            "bundleId": Bundle.main.bundleIdentifier ?? "", "characters": text.count,
            "utf8Bytes": text.utf8.count, "sha256": digest,
            "isActive": NSApp.isActive, "keyWindowMatches": NSApp.keyWindow === window,
            "pasteMenuPresent": NSApp.mainMenu?.item(at: 1)?.submenu?.items.contains(where: { $0.action == #selector(NSText.paste(_:)) }) ?? false,
            "pasteResponderIsEditor": (NSApp.target(forAction: #selector(NSText.paste(_:))) as? NSTextView) === editor,
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
