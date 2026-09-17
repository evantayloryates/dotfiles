import AppKit
import Foundation

// Everything the app knows about the harness: where it listens, where its
// state lives, how to read the password, how to talk to launchd.
enum Harness {
    static let host = "127.0.0.1"
    static let port = 4096
    static let origin = "http://127.0.0.1:4096"
    static let user = "opencode"
    static let serviceLabel = "com.taylor.zdr-harness"
    static let passwordKey = "ZDR_HARNESS_PASSWORD"

    // The web UI is served behind the same Basic auth, so the rule list lets
    // exactly this origin through and blocks everything else.
    static let contentRules = """
    [
      { "trigger": { "url-filter": ".*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": "^http://127\\\\.0\\\\.0\\\\.1:4096/" },
        "action": { "type": "ignore-previous-rules" } }
    ]
    """

    static let home = FileManager.default.homeDirectoryForCurrentUser
    static let root = home.appendingPathComponent(".zdr-harness")
    static let workDir = root.appendingPathComponent("work").path
    static let logsDir = root.appendingPathComponent("logs")
    static let defaultEnvFile = root.appendingPathComponent(".env")
    static let launchAgentPlist = home.appendingPathComponent("Library/LaunchAgents/\(serviceLabel).plist")

    // build_app.py records the resolved checkout path; the ~/dotfiles symlink is the fallback.
    static var readme: URL {
        if let path = Bundle.main.object(forInfoDictionaryKey: "ZDRHarnessReadme") as? String {
            return URL(fileURLWithPath: path)
        }
        return home.appendingPathComponent("dotfiles/src/zdr-harness/README.md")
    }

    // The secrets file lives beside the wrapper in the checkout; ~/.zdr-harness
    // is the fallback. OpenCode resolves {env:...} when the server starts, so a
    // rolled token only reaches it through a restart.
    static var secretsFile: URL {
        if let path = Bundle.main.object(forInfoDictionaryKey: "ZDRHarnessWrapper") as? String {
            let candidate = URL(fileURLWithPath: path)
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent(".env")
            if FileManager.default.fileExists(atPath: candidate.path) { return candidate }
        }
        return root.appendingPathComponent(".env")
    }

    // `zdr-harness serve` touches this immediately before exec'ing OpenCode.
    static var serveMarker: URL { root.appendingPathComponent("run/serve-started") }

    /// True when the secrets file was edited after the running server read it.
    static var secretsAreStale: Bool {
        let fm = FileManager.default
        guard let secrets = (try? fm.attributesOfItem(atPath: secretsFile.path))?[.modificationDate] as? Date,
              let started = (try? fm.attributesOfItem(atPath: serveMarker.path))?[.modificationDate] as? Date
        else { return false }
        return secrets > started
    }

    static var wrapper: String {
        if let path = Bundle.main.object(forInfoDictionaryKey: "ZDRHarnessWrapper") as? String { return path }
        return "~/dotfiles/src/zdr-harness/bin/zdr-harness"
    }

    // OpenCode 1.18.31 forces its new layout for fresh profiles: "/" lists projects
    // and sessions; "/:dir/session" without an id redirects to an empty draft.
    static let startURL = URL(string: "\(origin)/")!

    // A session route: /<URL-safe base64 of the directory, no padding>/session/<id>.
    static func sessionURL(_ id: String) -> URL? {
        guard !id.isEmpty, id.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_") }) else { return nil }
        let encoded = Data(workDir.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return URL(string: "\(origin)/\(encoded)/session/\(id)")
    }

    static func isHarnessURL(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "http" && url.host == host && url.port == port
            && url.user == nil && url.password == nil
    }

    // For logs: scheme, host, port and path only. Never a query string.
    static func redact(_ url: URL) -> String {
        guard let scheme = url.scheme?.lowercased() else { return "<no scheme>" }
        guard let host = url.host else { return "\(scheme):" }
        return "\(scheme)://\(host)\(url.port.map { ":\($0)" } ?? "")\(url.path)"
    }

    enum AuthDecision { case useCredential, cancel }

    // The only challenge ever answered: Basic, from the harness origin, first try.
    static func authDecision(for space: URLProtectionSpace, previousFailures: Int) -> AuthDecision {
        guard space.authenticationMethod == NSURLAuthenticationMethodHTTPBasic,
              space.host == host, space.port == port, !space.isProxy(),
              (space.protocol ?? "http").lowercased() == "http",
              previousFailures == 0
        else { return .cancel }
        return .useCredential
    }

    static func reauthCommand(for server: String) -> String {
        "\(wrapper) mcp auth \(server) && \(wrapper) restart"
    }

    // MARK: password

    enum EnvError: Error, CustomStringConvertible {
        case unreadable(path: String, reason: String)
        case missing(path: String)

        var description: String {
            switch self {
            case let .unreadable(path, reason): return "Could not read \(path): \(reason)"
            case let .missing(path): return "\(path) has no non-empty \(Harness.passwordKey) line."
            }
        }
    }

    // Reads only the password line: tolerates `export`, quotes and CRLF.
    static func readPassword(from file: URL) throws -> String {
        let text: String
        do {
            text = try String(contentsOf: file, encoding: .utf8)
        } catch {
            throw EnvError.unreadable(path: file.path, reason: (error as NSError).localizedDescription)
        }
        var found: String?
        for raw in text.split(whereSeparator: \.isNewline) {
            var line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty || line.hasPrefix("#") { continue }
            if line.hasPrefix("export ") { line = String(line.dropFirst(7)).trimmingCharacters(in: .whitespaces) }
            guard let eq = line.firstIndex(of: "="),
                  line[..<eq].trimmingCharacters(in: .whitespaces) == passwordKey else { continue }
            var value = line[line.index(after: eq)...].trimmingCharacters(in: .whitespaces)
            if value.count >= 2, let first = value.first, first == "\"" || first == "'", value.last == first {
                value = String(value.dropFirst().dropLast())
            }
            found = value
        }
        guard let password = found, !password.isEmpty else { throw EnvError.missing(path: file.path) }
        return password
    }

    // MARK: launchd

    // kickstart -k restarts a loaded service; bootstrap loads one that was booted out.
    static func restartService(completion: @escaping (Int32) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let domain = "gui/\(getuid())"
            var status = run("/bin/launchctl", ["kickstart", "-k", "\(domain)/\(serviceLabel)"])
            AppLog.write("launchctl kickstart -k exit=\(status)")
            if status != 0 {
                status = run("/bin/launchctl", ["bootstrap", domain, launchAgentPlist.path])
                AppLog.write("launchctl bootstrap exit=\(status)")
            }
            DispatchQueue.main.async { completion(status) }
        }
    }

    private static func run(_ tool: String, _ args: [String]) -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: tool)
        process.arguments = args
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus
        } catch {
            return -1
        }
    }
}

// Append-only log at ~/.zdr-harness/logs/app.log, rotated at ~1 MB. Callers
// pass only redacted URLs and statuses; nothing here ever sees a credential.
enum AppLog {
    private static let queue = DispatchQueue(label: "com.taylor.zdr-harness.app.log")
    private static let file = Harness.logsDir.appendingPathComponent("app.log")
    private static let formatter = ISO8601DateFormatter()

    static func write(_ message: String) {
        let line = "\(formatter.string(from: Date())) [\(getpid())] \(message)\n"
        queue.async {
            let fm = FileManager.default
            try? fm.createDirectory(at: Harness.logsDir, withIntermediateDirectories: true,
                                    attributes: [.posixPermissions: 0o700])
            if let size = (try? fm.attributesOfItem(atPath: file.path))?[.size] as? Int, size > 1_000_000 {
                let old = file.appendingPathExtension("1")
                try? fm.removeItem(at: old)
                try? fm.moveItem(at: file, to: old)
            }
            if !fm.fileExists(atPath: file.path) {
                fm.createFile(atPath: file.path, contents: nil, attributes: [.posixPermissions: 0o600])
            }
            guard let handle = try? FileHandle(forWritingTo: file) else { return }
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: Data(line.utf8))
        }
    }

    static func flush() { queue.sync {} }
}

// MARK: health

struct HealthSnapshot: Equatable {
    var reachable = false
    var healthy = false
    var version: String?
    var mcp: [String: String] = [:]
    var error: String?

    var brokenServers: [(String, String)] {
        mcp.filter { $0.value != "connected" && $0.value != "disabled" }.sorted { $0.0 < $1.0 }
    }

    var summary: String {
        guard reachable else { return "Down · \(error ?? "not reachable")" }
        guard healthy else { return "Unhealthy · \(error ?? "health check failed")" }
        let servers = mcp.keys.sorted().map { name in
            mcp[name] == "connected" ? "\(name) ✓" : "\(name) \(mcp[name] ?? "?")"
        }
        return (["Healthy"] + servers).joined(separator: " · ")
    }

    var allGood: Bool { reachable && healthy && !mcp.isEmpty && brokenServers.isEmpty }
    var passwordRejected: Bool { error?.hasPrefix("HTTP 401") == true }
}

// Authenticated GET /global/health and GET /mcp over an ephemeral session that
// answers only the harness's Basic challenge and never follows redirects.
final class HealthClient: NSObject, URLSessionTaskDelegate {
    private let credential: URLCredential
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 5
        config.urlCache = nil
        config.httpCookieStorage = nil
        config.connectionProxyDictionary = [:]
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    init(credential: URLCredential) {
        self.credential = credential
    }

    func check(completion: @escaping (HealthSnapshot) -> Void) {
        get("/global/health") { healthResult in
            var snapshot = HealthSnapshot()
            switch healthResult {
            case let .failure(error):
                snapshot.error = error
                snapshot.reachable = !error.hasPrefix("connect:")
                DispatchQueue.main.async { completion(snapshot) }
                return
            case let .success(json):
                snapshot.reachable = true
                snapshot.healthy = (json as? [String: Any])?["healthy"] as? Bool ?? false
                snapshot.version = (json as? [String: Any])?["version"] as? String
            }
            self.get("/mcp") { mcpResult in
                switch mcpResult {
                case let .failure(error):
                    snapshot.error = "mcp: \(error)"
                    snapshot.reachable = !error.hasPrefix("connect:")
                case let .success(json):
                    for (name, value) in (json as? [String: Any]) ?? [:] {
                        snapshot.mcp[name] = (value as? [String: Any])?["status"] as? String ?? "unknown"
                    }
                }
                DispatchQueue.main.async { completion(snapshot) }
            }
        }
    }

    private enum Result { case success(Any), failure(String) }

    private func get(_ path: String, completion: @escaping (Result) -> Void) {
        var request = URLRequest(url: URL(string: Harness.origin + path)!)
        request.setValue(Harness.workDir, forHTTPHeaderField: "x-opencode-directory")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        session.dataTask(with: request) { data, response, error in
            if let error = error as NSError? {
                completion(.failure("connect: \(error.localizedDescription)"))
                return
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200, let data, let json = try? JSONSerialization.jsonObject(with: data) else {
                completion(.failure("HTTP \(status) from \(path)"))
                return
            }
            completion(.success(json))
        }.resume()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        switch Harness.authDecision(for: challenge.protectionSpace, previousFailures: challenge.previousFailureCount) {
        case .useCredential:
            completionHandler(.useCredential, credential)
        case .cancel where challenge.previousFailureCount > 0:
            // A rejected password: let the 401 through so the app can say so.
            completionHandler(.rejectProtectionSpace, nil)
        case .cancel:
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
