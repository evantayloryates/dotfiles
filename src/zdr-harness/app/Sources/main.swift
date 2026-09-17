import AppKit
import WebKit

struct Options {
    var selfTest = false
    var recovery = false
    var expectEnvError = false
    var debug = false
    var canaryPort: Int?
    var envFile: URL?
    var snapshotDir: URL?
    var sessionID: String?

    // Unknown arguments (e.g. -NSDocumentRevisionsDebugMode from Xcode tools) are ignored.
    static func parse(_ args: [String]) -> Options {
        var options = Options()
        var index = 1
        func value() -> String? {
            index += 1
            return index < args.count ? args[index] : nil
        }
        while index < args.count {
            switch args[index] {
            case "--self-test": options.selfTest = true
            case "--self-test-recovery": options.selfTest = true; options.recovery = true
            case "--expect-env-error": options.selfTest = true; options.expectEnvError = true
            case "--debug": options.debug = true
            case "--canary-port": options.canaryPort = value().flatMap(Int.init)
            case "--env-file": options.envFile = value().map { URL(fileURLWithPath: $0) }
            case "--session": options.sessionID = value()
            case "--snapshot-dir": options.snapshotDir = value().map { URL(fileURLWithPath: $0, isDirectory: true) }
            default: break
            }
            index += 1
        }
        return options
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    let options: Options
    private var controller: MainController!
    private var selfTest: SelfTest?

    init(options: Options) {
        self.options = options
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if !options.selfTest {
            let bundleID = Bundle.main.bundleIdentifier ?? ""
            let current = NSRunningApplication.current
            if let other = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
                .first(where: { $0.processIdentifier != current.processIdentifier }) {
                other.activate()
                exit(0)
            }
        }
        NSApp.setActivationPolicy(options.selfTest ? .accessory : .regular)
        controller = MainController(options: options)
        NSApp.mainMenu = buildMenu()
        if options.selfTest {
            let test = SelfTest(controller: controller, options: options)
            controller.observer = test
            selfTest = test
            test.begin()
            controller.window.orderFrontRegardless()
        } else {
            controller.window.makeKeyAndOrderFront(nil)
            NSApp.activate()
        }
        controller.start()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        controller.window.makeKeyAndOrderFront(nil)
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // Drop HTTP caches (copies of session content) before exiting; give up after 3 s.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        var replied = false
        let reply = {
            guard !replied else { return }
            replied = true
            AppLog.write("quit")
            AppLog.flush()
            NSApp.reply(toApplicationShouldTerminate: true)
        }
        WKWebsiteDataStore.default().removeData(ofTypes: cacheDataTypes, modifiedSince: .distantPast) { reply() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { reply() }
        return .terminateLater
    }

    private func buildMenu() -> NSMenu {
        let main = NSMenu()
        func submenu(_ title: String, _ items: [NSMenuItem]) {
            let holder = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            let menu = NSMenu(title: title)
            items.forEach(menu.addItem)
            holder.submenu = menu
            main.addItem(holder)
        }
        func item(_ title: String, _ action: Selector, _ key: String = "",
                  _ modifiers: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) -> NSMenuItem {
            let menuItem = NSMenuItem(title: title, action: action, keyEquivalent: key)
            menuItem.keyEquivalentModifierMask = modifiers
            menuItem.target = target
            return menuItem
        }
        let c = controller!

        submenu("ZDR Harness", [
            item("About ZDR Harness", #selector(NSApplication.orderFrontStandardAboutPanel(_:))),
            .separator(),
            item("Hide ZDR Harness", #selector(NSApplication.hide(_:)), "h"),
            item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
            item("Show All", #selector(NSApplication.unhideAllApplications(_:))),
            .separator(),
            item("Quit ZDR Harness", #selector(NSApplication.terminate(_:)), "q"),
        ])
        submenu("Edit", [
            item("Undo", Selector(("undo:")), "z"),
            item("Redo", Selector(("redo:")), "z", [.command, .shift]),
            .separator(),
            item("Cut", #selector(NSText.cut(_:)), "x"),
            item("Copy", #selector(NSText.copy(_:)), "c"),
            item("Paste", #selector(NSText.paste(_:)), "v"),
            item("Select All", #selector(NSText.selectAll(_:)), "a"),
            .separator(),
            item("Find…", #selector(MainController.find(_:)), "f", target: c),
            item("Find Next", #selector(MainController.findNext(_:)), "g", target: c),
            item("Find Previous", #selector(MainController.findPrevious(_:)), "g", [.command, .shift], target: c),
        ])
        submenu("View", [
            item("Reload", #selector(MainController.reload(_:)), "r", target: c),
            .separator(),
            item("Actual Size", #selector(MainController.actualSize(_:)), "0", target: c),
            item("Zoom In", #selector(MainController.zoomIn(_:)), "+", target: c),
            item("Zoom Out", #selector(MainController.zoomOut(_:)), "-", target: c),
        ])
        submenu("Harness", [
            item("Status…", #selector(MainController.showStatus(_:)), target: c),
            item("Reload", #selector(MainController.reload(_:)), target: c),
            item("Restart Service", #selector(MainController.restartService(_:)), target: c),
            .separator(),
            item("Open Logs Folder", #selector(MainController.openLogs(_:)), target: c),
            item("Open README", #selector(MainController.openReadme(_:)), target: c),
            item("Copy Web URL", #selector(MainController.copyWebURL(_:)), target: c),
        ])
        let windowItems = [
            item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
            item("Zoom", #selector(NSWindow.performZoom(_:))),
            .separator(),
            item("Bring All to Front", #selector(NSApplication.arrangeInFront(_:))),
        ]
        submenu("Window", windowItems)
        NSApp.windowsMenu = main.items.last?.submenu
        return main
    }
}

let options = Options.parse(CommandLine.arguments)
let app = NSApplication.shared
let delegate = AppDelegate(options: options)
app.delegate = delegate
app.run()
