import AppKit
import CoreGraphics
import ScreenCaptureKit
import Security

final class Engine: @unchecked Sendable {
  let paths: Paths
  private let lock: InstanceLock
  private var server: SocketServer?
  private var signalSources: [DispatchSourceSignal] = []
  private let startedAt = Date()
  private let startedNs = uptimeNs()

  init(paths: Paths, lock: InstanceLock) {
    self.paths = paths
    self.lock = lock
  }

  func start() throws {
    let server = SocketServer(path: paths.socket) { [unowned self] method, params in
      try await self.handle(method, params)
    }
    try server.start()
    self.server = server
    for sig in [SIGTERM, SIGINT] {
      signal(sig, SIG_IGN)
      let s = DispatchSource.makeSignalSource(signal: sig, queue: .main)
      s.setEventHandler { [weak self] in
        Log.event("exit", ["reason": "signal \(sig)"])
        self?.server?.stop()
        exit(0)
      }
      s.resume()
      signalSources.append(s)
    }
    Log.event("start", [
      "pid": getpid(), "version": Build.version, "build": Build.hash, "socket": paths.socket,
      "screen_recording": CGPreflightScreenCaptureAccess(),
    ])
  }

  // MARK: - Methods

  private func handle(_ method: String, _ params: [String: Any]) async throws -> Any {
    switch method {
    case "ping":
      return ["pong": true, "clock_ns": uptimeNs()]
    case "status":
      return await status()
    case "permission.request":
      return await requestPermission()
    case "capture.probe":
      return try await probe()
    default:
      throw RPCError(code: "unknown_method", message: "unknown method \(method); try status")
    }
  }

  private func status() async -> [String: Any] {
    let now = Date()
    return [
      "engine": [
        "version": Build.version,
        "build": Build.hash,
        "pid": Int(getpid()),
        "bundle_id": Bundle.main.bundleIdentifier ?? "",
        "bundle_path": Bundle.main.bundlePath,
        "signing": Build.signing,
        "started_at": iso8601.string(from: startedAt),
        "uptime_s": now.timeIntervalSince(startedAt),
        "launched_by_launchd": getppid() == 1,
      ],
      "clock": ["uptime_ns": uptimeNs(), "wall": iso8601.string(from: now), "started_ns": startedNs],
      "permission": ["screen_recording": CGPreflightScreenCaptureAccess() ? "granted" : "missing"],
      "displays": await displays(),
      "paths": ["root": paths.root, "socket": paths.socket, "log": paths.log],
    ]
  }

  /// Shows macOS's Screen Recording prompt for this app. macOS only prompts
  /// once per app; after that the switch lives in System Settings.
  private func requestPermission() async -> [String: Any] {
    if CGPreflightScreenCaptureAccess() { return ["screen_recording": "granted"] }
    let granted = await MainActor.run { CGRequestScreenCaptureAccess() }
    Log.event("permission_request", ["granted": granted])
    return [
      "screen_recording": granted ? "granted" : "missing",
      "next": granted ? "" : "Turn on record-screend in System Settings > Privacy & Security > Screen & System Audio Recording, then run `record-screen restart`.",
    ]
  }

  /// Proves ScreenCaptureKit works for this process, with timings.
  private func probe() async throws -> [String: Any] {
    let t0 = uptimeNs()
    let content: SCShareableContent
    do {
      content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    } catch {
      throw RPCError(code: "capture_unavailable", message: "ScreenCaptureKit refused: \(error.localizedDescription). Run `record-screen grant`.")
    }
    let t1 = uptimeNs()
    guard let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() }) ?? content.displays.first else {
      throw RPCError(code: "no_display", message: "no capturable display")
    }
    let cfg = SCStreamConfiguration()
    cfg.width = 64
    cfg.height = 64
    cfg.showsCursor = false
    _ = try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(display: display, excludingWindows: []), configuration: cfg)
    let t2 = uptimeNs()
    return [
      "ok": true,
      "displays": content.displays.count,
      "windows": content.windows.count,
      "list_ms": Double(t1 - t0) / 1e6,
      "screenshot_ms": Double(t2 - t1) / 1e6,
    ]
  }

  private func displays() async -> [[String: Any]] {
    let names: [CGDirectDisplayID: String] = await MainActor.run {
      var m: [CGDirectDisplayID: String] = [:]
      for s in NSScreen.screens {
        if let n = s.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber {
          m[CGDirectDisplayID(n.uint32Value)] = s.localizedName
        }
      }
      return m
    }
    var count: UInt32 = 0
    CGGetActiveDisplayList(0, nil, &count)
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    CGGetActiveDisplayList(count, &ids, &count)
    return ids.map { id in
      let b = CGDisplayBounds(id)
      let mode = CGDisplayCopyDisplayMode(id)
      let pw = mode?.pixelWidth ?? Int(b.width)
      return [
        "id": Int(id),
        "name": names[id] ?? "",
        "main": CGDisplayIsMain(id) != 0,
        "frame": ["x": b.origin.x, "y": b.origin.y, "w": b.width, "h": b.height],
        "pixels": ["w": pw, "h": mode?.pixelHeight ?? Int(b.height)],
        "scale": b.width > 0 ? Double(pw) / Double(b.width) : 1,
        "refresh_hz": mode?.refreshRate ?? 0,
      ]
    }
  }
}

enum Build {
  static let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
  static let hash = Bundle.main.object(forInfoDictionaryKey: "RSBuildHash") as? String ?? "dev"

  /// Which identity signed the running bundle. An ad-hoc signature changes on
  /// every build, and macOS then forgets the Screen Recording grant.
  static let signing: [String: Any] = {
    var code: SecCode?
    var staticCode: SecStaticCode?
    var info: CFDictionary?
    guard SecCodeCopySelf([], &code) == errSecSuccess, let code,
          SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode,
          SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
          let dict = info as? [String: Any] else { return ["kind": "unknown"] }
    let team = dict[kSecCodeInfoTeamIdentifier as String] as? String
    let certs = dict[kSecCodeInfoCertificates as String] as? [SecCertificate] ?? []
    let leaf = certs.first.flatMap { SecCertificateCopySubjectSummary($0) as String? } ?? ""
    return ["kind": team == nil ? "adhoc" : "identity", "team": team ?? "", "certificate": leaf]
  }()
}
