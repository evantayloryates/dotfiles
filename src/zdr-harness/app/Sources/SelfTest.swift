import AppKit
import Network
import WebKit

// --self-test: drive the real window code without a human and print one JSON
// object. Page checks run through callAsyncJavaScript, so nothing is exposed
// to the page; no script message handler is installed in any mode.
final class SelfTest: NSObject, MainControllerObserver, WKNavigationDelegate {
    enum Mode { case standard, recovery, envError }

    private let controller: MainController
    private let options: Options
    private let mode: Mode
    private var result: [String: Any] = [:]
    private var finished = false
    private var canary: LoopbackCanary?
    private var controlCanary: LoopbackCanary?
    private var controlView: WKWebView?
    private var controlDone: ((Bool) -> Void)?
    private var ranPageChecks = false

    init(controller: MainController, options: Options) {
        self.controller = controller
        self.options = options
        mode = options.expectEnvError ? .envError : (options.recovery ? .recovery : .standard)
        super.init()
        result["mode"] = "\(mode)"
    }

    func begin() {
        let timeout: TimeInterval = mode == .recovery ? 180 : 90
        Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
            self?.result["timedOut"] = true
            self?.finish()
        }
        guard mode == .standard else { return }
        // Blocking is proven against a listener that is not the harness: the
        // external canary when given (its access log is the evidence), else
        // one in this process that counts accepted connections.
        if options.canaryPort == nil {
            canary = LoopbackCanary()
            canary?.start()
        }
        controlCanary = LoopbackCanary()
        controlCanary?.start()
    }

    // MARK: observer

    func ruleListCompiled(_ ok: Bool, error: String?) {
        result["ruleListCompiled"] = ok
        if !ok {
            result["ruleListError"] = error
            finish()
        }
    }

    func fatalShown(kind: MainController.Fatal, message: String) {
        result["fatal"] = "\(kind)"
        if mode == .envError && kind == .env {
            let path = (options.envFile ?? Harness.defaultEnvFile).path
            result["envErrorShown"] = true
            result["envErrorNamesFile"] = message.contains(path)
            snapshotNative(name: "env-error.png") { self.finish() }
            return
        }
        finish()
    }

    func placeholderShown(_ snapshot: HealthSnapshot) {
        guard mode == .recovery, result["placeholderShown"] == nil else { return }
        result["startedDown"] = !snapshot.reachable
        result["placeholderShown"] = true
        snapshotNative(name: "placeholder.png") {
            // The same action the placeholder's "Restart Service" button sends.
            self.controller.restartService(nil)
            self.result["restartInvoked"] = true
        }
    }

    func restartFinished(status: Int32) {
        result["restartExitStatus"] = Int(status)
    }

    func pageFinished(status: Int?) {
        guard !ranPageChecks, controller.webView?.url.map(Harness.isHarnessURL) == true else { return }
        ranPageChecks = true
        result["mainFrameStatus"] = status ?? 0
        if mode == .recovery {
            result["uiReloaded"] = status == 200
            snapshotWeb(name: "ui-recovered.png") { self.finish() }
            return
        }
        runPageChecks(status: status)
    }

    // MARK: checks

    private func runPageChecks(status: Int?) {
        guard let webView = controller.webView else { return finish() }
        let port = options.canaryPort ?? canary?.port ?? 0
        result["canary"] = options.canaryPort != nil ? "external" : "in-process"
        // Informational: the same check ⌘R uses to decide between reloading the
        // page and restarting the server.
        result["secretsStale"] = Harness.secretsAreStale
        result["secretsFile"] = Harness.secretsFile.path
        let space = { (host: String, port: Int, method: String) in
            URLProtectionSpace(host: host, port: port, protocol: "http", realm: "x", authenticationMethod: method)
        }
        result["foreignAuthCancelled"] =
            Harness.authDecision(for: space("127.0.0.1", port, NSURLAuthenticationMethodHTTPBasic), previousFailures: 0) == .cancel
            && Harness.authDecision(for: space("localhost", Harness.port, NSURLAuthenticationMethodHTTPBasic), previousFailures: 0) == .cancel
            && Harness.authDecision(for: space("127.0.0.1", Harness.port, NSURLAuthenticationMethodHTTPDigest), previousFailures: 0) == .cancel
            && Harness.authDecision(for: space("127.0.0.1", Harness.port, NSURLAuthenticationMethodHTTPBasic), previousFailures: 1) == .cancel
            && Harness.authDecision(for: space("127.0.0.1", Harness.port, NSURLAuthenticationMethodHTTPBasic), previousFailures: 0) == .useCredential

        webView.callAsyncJavaScript(pageChecksJS, arguments: ["canaryPort": port, "dir": Harness.workDir,
                                                             "sessionID": options.sessionID ?? ""],
                                    in: nil, in: .page) { outcome in
            switch outcome {
            case let .success(value):
                let page = value as? [String: Any] ?? [:]
                self.result.merge(page) { _, new in new }
                self.result["pageLoaded"] = status == 200 && (page["rootChildren"] as? Int ?? 0) > 0
                    && (page["rootTextLength"] as? Int ?? 0) > 0
                // Home must list the sessions the API returned. One visible title can be an
                // open tab, so require two whenever the API has two.
                let apiCount = page["apiCount"] as? Int ?? 0
                if self.options.sessionID == nil, apiCount > 0 {
                    self.result["sessionsListed"] = page["sessionTitlesVisible"] as? Int ?? 0 >= min(apiCount, 2)
                }
                self.result["apiAuth"] = page["apiStatus"] as? Int == 200 && page["apiIsArray"] as? Bool == true
                if self.options.sessionID != nil {
                    self.result["markdownImagesBlocked"] = page["markdownImagesInserted"] as? Int == 2
                        && page["markdownImagesLoaded"] as? Int == 0
                }
            case let .failure(error):
                self.result["pageChecksError"] = (error as NSError).localizedDescription
            }
            self.snapshotWeb(name: "ui.png") {
                // Let any late request reach a canary before counting.
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.runControl() }
            }
        }
    }

    // Positive control: a throwaway web view with no rule list and no
    // credentials must reach its own canary, or "0 requests" proves nothing.
    private func runControl() {
        guard let controlCanary, let port = controlCanary.port else {
            result["controlReached"] = false
            return finish()
        }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 100, height: 100), configuration: config)
        view.navigationDelegate = self
        controlView = view
        controlDone = { reached in
            self.result["controlFetchResolved"] = reached
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                self.result["controlConnections"] = controlCanary.connections
                self.result["controlReached"] = controlCanary.connections > 0
                self.finish()
            }
        }
        view.loadHTMLString("<!doctype html><title>control</title>", baseURL: nil)
        _ = port
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === controlView, let port = controlCanary?.port else { return }
        webView.callAsyncJavaScript(
            "try { await fetch(`http://127.0.0.1:${port}/control`, { mode: 'no-cors' }); return true } catch (_) { return false }",
            arguments: ["port": port], in: nil, in: .page
        ) { outcome in
            if case let .success(value) = outcome { self.controlDone?(value as? Bool ?? false) } else { self.controlDone?(false) }
        }
    }

    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge,
                 completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        completionHandler(.cancelAuthenticationChallenge, nil)
    }

    // MARK: output

    private func finish() {
        guard !finished else { return }
        finished = true
        if let canary { result["canaryConnections"] = canary.connections }
        let required: [String]
        switch mode {
        case .standard:
            required = ["ruleListCompiled", "pageLoaded", "apiAuth", "sse", "blockedLocalCanary", "blockedImage",
                        "blockedWebSocket", "foreignAuthCancelled", "rtcPeerConnectionAbsent", "dnsPrefetchControlOff",
                        "controlReached"]
            if let canary { result["canaryUntouched"] = canary.connections == 0 }
        case .recovery:
            required = ["ruleListCompiled", "startedDown", "placeholderShown", "restartInvoked", "uiReloaded"]
            result["restartSucceeded"] = result["restartExitStatus"] as? Int == 0
        case .envError:
            required = ["envErrorShown", "envErrorNamesFile"]
        }
        var checks = required
        if result["sessionsListed"] != nil || (mode == .standard && options.sessionID == nil) { checks.append("sessionsListed") }
        if mode == .standard && options.sessionID != nil { checks.append("markdownImagesBlocked") }
        if canary != nil { checks.append("canaryUntouched") }
        if mode == .recovery { checks.append("restartSucceeded") }
        let pass = result["timedOut"] == nil && checks.allSatisfy { result[$0] as? Bool == true }
        result["failed"] = checks.filter { result[$0] as? Bool != true }
        result["allPass"] = pass
        canary?.stop()
        controlCanary?.stop()
        AppLog.write("self-test mode=\(mode) allPass=\(pass)")
        AppLog.flush()
        if let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]),
           let text = String(data: data, encoding: .utf8) {
            print(text)
        }
        fflush(stdout)
        exit(pass ? 0 : 1)
    }

    private func snapshotWeb(name: String, then: @escaping () -> Void) {
        guard let dir = options.snapshotDir, let webView = controller.webView else { return then() }
        webView.takeSnapshot(with: nil) { image, _ in
            if let image { self.writePNG(image, to: dir.appendingPathComponent(name)) }
            then()
        }
    }

    private func snapshotNative(name: String, then: @escaping () -> Void) {
        guard let dir = options.snapshotDir, let view = controller.window.contentView else { return then() }
        DispatchQueue.main.async {
            view.layoutSubtreeIfNeeded()
            if let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
                view.cacheDisplay(in: view.bounds, to: rep)
                // cacheDisplay leaves the window background transparent; paint it in.
                let image = NSImage(size: view.bounds.size, flipped: false) { rect in
                    view.effectiveAppearance.performAsCurrentDrawingAppearance {
                        NSColor.windowBackgroundColor.setFill()
                        rect.fill()
                    }
                    rep.draw(in: rect)
                    return true
                }
                self.writePNG(image, to: dir.appendingPathComponent(name))
            }
            then()
        }
    }

    private func writePNG(_ image: NSImage, to url: URL) {
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else { return }
        try? png.write(to: url)
    }
}

// Counts TCP connections accepted on an ephemeral loopback port.
final class LoopbackCanary {
    private var listener: NWListener?
    private(set) var connections = 0
    private(set) var port: Int?

    func start() {
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        guard let listener = try? NWListener(using: params) else { return }
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { state in
            if case .ready = state { ready.signal() }
            if case .failed = state { ready.signal() }
        }
        listener.newConnectionHandler = { [weak self] connection in
            DispatchQueue.main.async { self?.connections += 1 }
            connection.cancel()
        }
        listener.start(queue: DispatchQueue(label: "com.taylor.zdr-harness.app.canary"))
        _ = ready.wait(timeout: .now() + 5)
        port = listener.port.map { Int($0.rawValue) }
        self.listener = listener
    }

    func stop() {
        listener?.cancel()
    }
}

private let pageChecksJS = """
const out = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const started = Date.now();
while (Date.now() - started < 20000) {
  const root = document.getElementById('root');
  if (root && root.children.length > 0 && root.innerText.trim().length > 0) break;
  await sleep(250);
}
const root = document.getElementById('root');
out.rootChildren = root ? root.children.length : 0;
out.rootTextLength = root ? root.innerText.trim().length : 0;
out.routePath = location.pathname;

let titles = [];
try {
  const r = await fetch('/session?limit=5', { headers: { 'x-opencode-directory': dir }, cache: 'no-store' });
  out.apiStatus = r.status;
  const body = await r.json().catch(() => null);
  out.apiIsArray = Array.isArray(body);
  out.apiCount = Array.isArray(body) ? body.length : null;
  if (Array.isArray(body)) titles = body.map((s) => (s.title || '').trim()).filter(Boolean);
} catch (e) {
  out.apiError = String(e);
}
// Counts only: titles are never returned.
const visible = () => titles.filter((t) => (document.getElementById('root')?.innerText || '').includes(t)).length;
for (let i = 0; i < 40 && titles.length && visible() === 0; i++) await sleep(250);
out.sessionTitlesVisible = visible();
if (sessionID) {
  await sleep(3000);
  const foreign = [...document.images].filter((img) => img.src && !img.src.startsWith('http://127.0.0.1:4096/') && !img.src.startsWith('data:') && !img.src.startsWith('blob:'));
  out.foreignImagesInPage = foreign.length;
  out.foreignImagesLoaded = foreign.filter((img) => img.complete && img.naturalWidth > 0).length;
}

out.sse = await new Promise((resolve) => {
  let es;
  const done = (v) => { try { es && es.close(); } catch (_) {} resolve(v); };
  const timer = setTimeout(() => done(false), 5000);
  try { es = new EventSource('/event'); } catch (_) { clearTimeout(timer); return done(false); }
  es.onmessage = (ev) => {
    try { if (JSON.parse(ev.data).type === 'server.connected') { clearTimeout(timer); done(true); } } catch (_) {}
  };
});

out.rtcPeerConnectionAbsent = typeof window.RTCPeerConnection === 'undefined' && typeof window.webkitRTCPeerConnection === 'undefined';
out.dnsPrefetchControlOff = !!document.querySelector('meta[http-equiv="x-dns-prefetch-control"][content="off"]');

const base = `127.0.0.1:${canaryPort}`;
try {
  await Promise.race([fetch(`http://${base}/canary`, { mode: 'no-cors', cache: 'no-store' }), sleep(5000).then(() => { throw 'timeout-not-blocked'; })]);
  out.blockedLocalCanary = false;
} catch (e) {
  out.blockedLocalCanary = e !== 'timeout-not-blocked';
}

const imageErrors = (src) => new Promise((resolve) => {
  const img = new Image();
  const timer = setTimeout(() => resolve(false), 5000);
  img.onload = () => { clearTimeout(timer); resolve(false); };
  img.onerror = () => { clearTimeout(timer); resolve(true); };
  img.src = src;
});
// http: is already outside the page CSP's img-src; https: is allowed by the
// CSP, so only the rule list stands between it and the canary.
out.blockedImageHttp = await imageErrors(`http://${base}/canary.png`);
out.blockedImageHttps = await imageErrors(`https://${base}/canary.png?d=test`);
out.blockedImage = out.blockedImageHttp && out.blockedImageHttps;

out.blockedWebSocket = await new Promise((resolve) => {
  let ws;
  const timer = setTimeout(() => { try { ws.close(); } catch (_) {} resolve(false); }, 5000);
  try { ws = new WebSocket(`ws://${base}/`); } catch (_) { clearTimeout(timer); return resolve(true); }
  ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(false); };
  ws.onerror = () => { clearTimeout(timer); resolve(true); };
  ws.onclose = () => { clearTimeout(timer); resolve(true); };
});

// No observable result in JS; the canary's connection count is the check.
try { out.beaconQueued = navigator.sendBeacon(`http://${base}/beacon`, 'x'); } catch (_) { out.beaconQueued = false; }
const probe = document.createElement('div');
probe.style.backgroundImage = `url(https://${base}/background.png)`;
probe.style.width = '1px';
probe.style.height = '1px';
document.body.appendChild(probe);
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = `https://${base}/style.css`;
document.head.appendChild(link);
await sleep(1500);
probe.remove();
link.remove();

// On a session route, put images where rendered Markdown goes, as a model answer
// with ![x](url) would. Only the rule list can stop the https: one.
if (sessionID) {
  const holder = document.createElement('div');
  holder.innerHTML = `<p><img alt="canary" src="https://${base}/leak.png?d=test"></p>` +
    `<p><img alt="canary-http" src="http://${base}/leak-http.png?d=test"></p>`;
  const markdown = [...document.querySelectorAll('[data-component="markdown"]')].pop();
  (markdown || document.getElementById('root')).appendChild(holder);
  await sleep(3000);
  const images = [...holder.querySelectorAll('img')];
  out.markdownImagesInserted = images.length;
  out.markdownImagesInMarkdownBlock = !!markdown;
  out.markdownImagesLoaded = images.filter((img) => img.complete && img.naturalWidth > 0).length;
  holder.remove();
}
return out;
"""
