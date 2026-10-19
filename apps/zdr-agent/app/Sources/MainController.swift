import AppKit
import WebKit

protocol MainControllerObserver: AnyObject {
    func fatalShown(kind: MainController.Fatal, message: String)
    func ruleListCompiled(_ ok: Bool, error: String?)
    func placeholderShown(_ snapshot: HealthSnapshot)
    func pageFinished(status: Int?)
    func restartFinished(status: Int32)
}

// Removes, on launch and quit, the HTTP caches that would otherwise keep copies
// of session content under ~/Library. localStorage (UI prefs, drafts) stays.
let cacheDataTypes: Set<String> = [
    WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache, WKWebsiteDataTypeFetchCache,
    WKWebsiteDataTypeOfflineWebApplicationCache, WKWebsiteDataTypeServiceWorkerRegistrations,
]

// Second layer for what a content rule list cannot see: DNS prefetch of links
// in rendered answers, and WebRTC (UDP, not a URL load).
private let hardeningScript = """
(() => {
  try {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'x-dns-prefetch-control';
    meta.content = 'off';
    (document.head || document.documentElement).appendChild(meta);
  } catch (_) {}
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel']) {
    try { Object.defineProperty(window, name, { value: undefined, writable: false, configurable: false }); } catch (_) {}
  }
})();
"""

final class MainController: NSObject, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    enum Fatal { case env, ruleList, passwordRejected }

    let window: NSWindow
    let options: Options
    weak var observer: MainControllerObserver?

    private(set) var webView: WKWebView?
    private(set) var health = HealthSnapshot()
    private var credential: URLCredential?
    private var healthClient: HealthClient?
    private var pollTimer: Timer?
    private var lastCheck = Date.distantPast
    private var webViewShown = false
    private var mainFrameStatus: Int?
    private var restarting = false
    private var alertedServers = Set<String>()
    private var fatal: Fatal?
    private var placeholderText: String?
    private var lastFind = ""

    private var initialURL: URL { options.sessionID.flatMap(Harness.sessionURL) ?? Harness.startURL }

    private let statusDot = NSTextField(labelWithString: "●")
    private let statusText = NSTextField(labelWithString: "Starting…")

    init(options: Options) {
        self.options = options
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        super.init()
        window.title = "ZDR Harness"
        window.minSize = NSSize(width: 640, height: 420)
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.contentView = NSView()
        if options.selfTest {
            window.alphaValue = 0
            window.ignoresMouseEvents = true
        } else {
            window.center()
            window.setFrameAutosaveName("ZDRHarnessMainWindow")
        }
        installStatusAccessory()
    }

    // MARK: startup

    func start() {
        AppLog.write("launch version=\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") ?? "?") selfTest=\(options.selfTest) debug=\(options.debug)")
        let envFile = options.envFile ?? Harness.secretsFile
        let password: String
        do {
            password = try Harness.readPassword(from: envFile)
        } catch {
            let message = "\(error)\n\nThe app reads \(Harness.passwordKey) from \(envFile.path) (see the harness README)."
            AppLog.write("password not available: \(error)")
            showFatal(.env, title: "Can't read the harness password", message: message)
            return
        }
        credential = URLCredential(user: Harness.user, password: password, persistence: .forSession)
        healthClient = HealthClient(credential: credential!)

        WKWebsiteDataStore.default().removeData(ofTypes: cacheDataTypes, modifiedSince: .distantPast) { [weak self] in
            self?.compileRules()
        }
    }

    private func compileRules() {
        WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: "zdr-harness-loopback-only", encodedContentRuleList: Harness.contentRules
        ) { [weak self] list, error in
            guard let self else { return }
            guard let list else {
                let reason = error.map { ($0 as NSError).localizedDescription } ?? "unknown error"
                AppLog.write("content rule list FAILED to compile: \(reason); refusing to load the UI")
                self.observer?.ruleListCompiled(false, error: reason)
                self.showFatal(.ruleList, title: "Content blocker failed to compile",
                               message: "The harness UI is not loaded without it.\n\n\(reason)")
                return
            }
            AppLog.write("content rule list compiled")
            self.observer?.ruleListCompiled(true, error: nil)
            self.makeWebView(rules: list)
            self.checkHealth(force: true)
        }
    }

    private func makeWebView(rules: WKContentRuleList) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController.add(rules)
        config.userContentController.addUserScript(
            WKUserScript(source: hardeningScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.preferences.isElementFullscreenEnabled = false
        config.mediaTypesRequiringUserActionForPlayback = .all
        config.applicationNameForUserAgent = "ZDRHarness/1.0"

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isInspectable = options.debug
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsMagnification = true
        self.webView = webView
    }

    // MARK: health

    func checkHealth(force: Bool = false) {
        guard let healthClient, webView != nil else { return }
        if !force, Date().timeIntervalSince(lastCheck) < 2 { return }
        lastCheck = Date()
        healthClient.check { [weak self] snapshot in self?.apply(snapshot) }
    }

    private func apply(_ snapshot: HealthSnapshot) {
        let previous = health
        health = snapshot
        if previous.summary != snapshot.summary {
            AppLog.write("health: \(snapshot.summary)")
        }
        updateStatus()

        if fatal != nil { return }
        if snapshot.passwordRejected {
            AppLog.write("harness rejected the password (HTTP 401)")
            showFatal(.passwordRejected, title: "The harness rejected the password",
                      message: "\(Harness.passwordKey) in \((options.envFile ?? Harness.secretsFile).path) does not match the running service.")
            return
        }
        if snapshot.reachable && snapshot.healthy {
            if !webViewShown { showWebView() }
            restarting = false
            alertBrokenServers(snapshot)
        } else if !restarting {
            showPlaceholder()
        }
        schedulePoll(interval: snapshot.allGood ? 30 : 5)
    }

    private func schedulePoll(interval: TimeInterval) {
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            self?.checkHealth(force: true)
        }
    }

    private func alertBrokenServers(_ snapshot: HealthSnapshot) {
        guard !options.selfTest else { return }
        for (server, status) in snapshot.brokenServers where !alertedServers.contains("\(server)=\(status)") {
            alertedServers.insert("\(server)=\(status)")
            let advice = Harness.recoveryAdvice(for: server)
            let command = advice.command
            let alert = NSAlert()
            alert.messageText = "\(server) MCP server is \(status)"
            alert.informativeText = "\(advice.summary)\n\n\(command)"
            alert.addButton(withTitle: "Copy Command")
            alert.addButton(withTitle: "OK")
            if alert.runModal() == .alertFirstButtonReturn {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(command, forType: .string)
            }
        }
    }

    @objc func restartService(_ sender: Any?) {
        guard !restarting else { return }
        restarting = true
        AppLog.write("restart service requested")
        showPlaceholder(message: "Restarting the service…")
        Harness.restartService { [weak self] status in
            guard let self else { return }
            self.observer?.restartFinished(status: status)
            if status != 0 {
                self.restarting = false
                self.showPlaceholder(message: "launchctl failed (exit \(status)). See \(Harness.logsDir.path).")
            }
            self.schedulePoll(interval: 2)
        }
    }

    @objc func retry(_ sender: Any?) {
        if webView == nil || fatal == .passwordRejected {
            fatal = nil
            webView = nil
            webViewShown = false
            start()
        } else {
            checkHealth(force: true)
        }
    }

    // MARK: content swapping

    private func setContent(_ view: NSView) {
        guard let content = window.contentView else { return }
        content.subviews.forEach { $0.removeFromSuperview() }
        placeholderText = nil
        view.frame = content.bounds
        view.autoresizingMask = [.width, .height]
        content.addSubview(view)
    }

    private func showWebView() {
        guard let webView else { return }
        setContent(webView)
        webViewShown = true
        AppLog.write("loading \(Harness.redact(initialURL))")
        webView.load(URLRequest(url: initialURL))
    }

    private func showPlaceholder(message: String? = nil) {
        webViewShown = false
        webView?.stopLoading()
        let detail = message ?? "\(health.summary)\n\nThe app keeps checking every 5 seconds and reloads once the service is healthy."
        guard detail != placeholderText else { return }
        setContent(messageView(title: "The ZDR harness service is not responding", message: detail, buttons: [
            ("Restart Service", #selector(restartService(_:))),
            ("Retry", #selector(retry(_:))),
        ]))
        placeholderText = detail
        if message == nil { observer?.placeholderShown(health) }
    }

    private func showFatal(_ kind: Fatal, title: String, message: String) {
        fatal = kind
        pollTimer?.invalidate()
        webViewShown = false
        statusDot.textColor = .systemRed
        statusText.stringValue = title
        var buttons: [(String, Selector)] = [("Quit", #selector(NSApplication.terminate(_:)))]
        if kind != .ruleList { buttons.insert(("Retry", #selector(retry(_:))), at: 0) }
        setContent(messageView(title: title, message: message, buttons: buttons))
        observer?.fatalShown(kind: kind, message: message)
    }

    private func messageView(title: String, message: String, buttons: [(String, Selector)]) -> NSView {
        let titleField = NSTextField(labelWithString: title)
        titleField.font = .boldSystemFont(ofSize: 17)
        let messageField = NSTextField(wrappingLabelWithString: message)
        messageField.isSelectable = true
        messageField.preferredMaxLayoutWidth = 520
        let buttonRow = NSStackView(views: buttons.map { title, action in
            let button = NSButton(title: title, target: self, action: action)
            if action == #selector(NSApplication.terminate(_:)) { button.target = NSApp }
            return button
        })
        let stack = NSStackView(views: [titleField, messageField, buttonRow])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        let container = NSView()
        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 560),
        ])
        return container
    }

    private func installStatusAccessory() {
        statusDot.textColor = .systemGray
        statusText.textColor = .secondaryLabelColor
        statusText.font = .systemFont(ofSize: 11)
        let stack = NSStackView(views: [statusDot, statusText])
        stack.spacing = 4
        stack.edgeInsets = NSEdgeInsets(top: 0, left: 0, bottom: 0, right: 10)
        stack.frame = NSRect(x: 0, y: 0, width: 360, height: 22)
        let accessory = NSTitlebarAccessoryViewController()
        accessory.view = stack
        accessory.layoutAttribute = .trailing
        window.addTitlebarAccessoryViewController(accessory)
    }

    private func updateStatus() {
        let stale = Harness.secretsAreStale
        statusText.stringValue = health.summary + (stale ? " · secrets changed (⇧⌘R)" : "")
        statusText.toolTip = stale
            ? "\(Harness.secretsFile.path) was edited after the server started. ⇧⌘R restarts it."
            : health.summary
        statusDot.textColor = health.allGood ? .systemGreen : (health.reachable && health.healthy ? .systemOrange : .systemRed)
    }

    // MARK: menu actions

    /// Reload the page, or restart the server first when the secrets file has
    /// been edited since it started: {env:...} is read only at server start, so
    /// reloading the page alone would silently keep the old token.
    @objc func reload(_ sender: Any?) {
        if Harness.secretsAreStale {
            AppLog.write("secrets file is newer than the running server; reloading auth")
            reloadAuth(sender)
            return
        }
        if webViewShown, let webView {
            webView.reload()
        }
        checkHealth(force: true)
    }

    @objc func reloadAuth(_ sender: Any?) {
        AppLog.write("reload auth requested")
        restartService(sender)
    }

    @objc func showStatus(_ sender: Any?) {
        checkHealth(force: true)
        let alert = NSAlert()
        alert.messageText = "ZDR harness status"
        alert.informativeText = "\(health.summary)\nOpenCode \(health.version ?? "?")\n\(Harness.origin)"
        alert.runModal()
    }

    @objc func openLogs(_ sender: Any?) { NSWorkspace.shared.open(Harness.logsDir) }
    @objc func openReadme(_ sender: Any?) { NSWorkspace.shared.open(Harness.readme) }

    @objc func copyWebURL(_ sender: Any?) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(Harness.startURL.absoluteString, forType: .string)
    }

    @objc func actualSize(_ sender: Any?) { webView?.pageZoom = 1 }
    @objc func zoomIn(_ sender: Any?) { webView.map { $0.pageZoom = min($0.pageZoom + 0.1, 3) } }
    @objc func zoomOut(_ sender: Any?) { webView.map { $0.pageZoom = max($0.pageZoom - 0.1, 0.5) } }

    @objc func find(_ sender: Any?) {
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.stringValue = lastFind
        let alert = NSAlert()
        alert.messageText = "Find"
        alert.accessoryView = field
        alert.addButton(withTitle: "Find")
        alert.addButton(withTitle: "Cancel")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        lastFind = field.stringValue
        findNext(sender)
    }

    @objc func findNext(_ sender: Any?) { runFind(backwards: false) }
    @objc func findPrevious(_ sender: Any?) { runFind(backwards: true) }

    private func runFind(backwards: Bool) {
        guard !lastFind.isEmpty, let webView else { return }
        let config = WKFindConfiguration()
        config.backwards = backwards
        config.wraps = true
        webView.find(lastFind, configuration: config) { result in
            if !result.matchFound { NSSound.beep() }
        }
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload {
            AppLog.write("denied download from \(action.request.url.map(Harness.redact) ?? "?")")
            decisionHandler(.cancel)
            return
        }
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        let isMainFrame = action.targetFrame?.isMainFrame ?? true
        let scheme = url.scheme?.lowercased() ?? ""
        if Harness.isHarnessURL(url)
            || url.absoluteString == "about:blank"
            || (!isMainFrame && ["about", "blob", "data"].contains(scheme)) {
            decisionHandler(.allow)
            return
        }
        decisionHandler(.cancel)
        AppLog.write("blocked \(isMainFrame ? "main-frame" : "sub-frame") navigation to \(Harness.redact(url))")
        if isMainFrame { confirmExternal(url) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.isForMainFrame {
            mainFrameStatus = (response.response as? HTTPURLResponse)?.statusCode
        }
        guard response.canShowMIMEType else {
            AppLog.write("denied download of \(response.response.url.map(Harness.redact) ?? "?")")
            decisionHandler(.cancel)
            return
        }
        if response.isForMainFrame, mainFrameStatus == 401 {
            decisionHandler(.cancel)
            AppLog.write("harness rejected the password (HTTP 401)")
            showFatal(.passwordRejected, title: "The harness rejected the password",
                      message: "\(Harness.passwordKey) in \((options.envFile ?? Harness.secretsFile).path) does not match the running service.")
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        AppLog.write("page loaded status=\(mainFrameStatus.map(String.init) ?? "?")")
        observer?.pageFinished(status: mainFrameStatus)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    private func handleLoadError(_ error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        if nsError.domain == "WebKitErrorDomain" && nsError.code == 102 { return } // interrupted by policy
        AppLog.write("load failed: \(nsError.domain) \(nsError.code)")
        if nsError.domain == NSURLErrorDomain {
            health.reachable = false
            health.healthy = false
            health.error = nsError.localizedDescription
            updateStatus()
            showPlaceholder()
            schedulePoll(interval: 5)
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        AppLog.write("web content process terminated; reloading")
        if webViewShown { webView.load(URLRequest(url: initialURL)) }
    }

    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge,
                 completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        let space = challenge.protectionSpace
        if let credential,
           Harness.authDecision(for: space, previousFailures: challenge.previousFailureCount) == .useCredential {
            completionHandler(.useCredential, credential)
            return
        }
        AppLog.write("cancelled \(space.authenticationMethod) challenge from \(space.host):\(space.port)")
        completionHandler(.cancelAuthenticationChallenge, nil)
    }

    // MARK: WKUIDelegate

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if Harness.isHarnessURL(url) {
                webView.load(URLRequest(url: url))
            } else {
                AppLog.write("blocked popup to \(Harness.redact(url))")
                confirmExternal(url)
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }

    // Links never load in the app. Show the full URL and let Taylor decide.
    private func confirmExternal(_ url: URL) {
        guard !options.selfTest, window.attachedSheet == nil,
              ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "") else { return }
        let alert = NSAlert()
        alert.messageText = "Open this link in your browser?"
        alert.informativeText = url.absoluteString
        let open = alert.addButton(withTitle: "Open in browser")
        open.keyEquivalent = ""
        let cancel = alert.addButton(withTitle: "Cancel")
        cancel.keyEquivalent = "\r"
        alert.beginSheetModal(for: window) { response in
            guard response == .alertFirstButtonReturn else { return }
            AppLog.write("opened external link in browser: \(Harness.redact(url))")
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: NSWindowDelegate

    func windowDidBecomeKey(_ notification: Notification) {
        checkHealth()
    }
}
