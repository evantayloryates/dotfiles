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
  private let viewfinder = Viewfinder()
  private lazy var sessions = Sessions(root: paths.root + "/sessions")
  private lazy var recordings = Recordings(legacyRoot: paths.root + "/recordings", sessions: sessions)

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
    // A stalled hardware encoder stays wedged for the life of the process.
    // Restart (launchd brings the engine back in ~5 s); scheduled recordings
    // re-arm, running ones are kept as interrupted.
    let restarting = NSLock()
    nonisolated(unsafe) var restartQueued = false
    Recording.onEncoderStall = {
      let first: Bool = restarting.withLock { defer { restartQueued = true }; return !restartQueued }
      guard first else { return }
      Log.event("exit", ["reason": "encoder stalled; restarting to recover"])
      DispatchQueue.global().asyncAfter(deadline: .now() + 1) { exit(75) }
    }
    let recordings = self.recordings, sessions = self.sessions
    Task {
      await sessions.load()
      await recordings.load()
    }
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
    let result = try await dispatch(method, params)
    // Every object reply carries the engine clock, so agents can compute
    // absolute start_at/end_at times without asking separately.
    if var d = result as? [String: Any], d["clock"] == nil {
      d["clock"] = ["wall": iso8601.string(from: Date()), "uptime_ns": uptimeNs()]
      return d
    }
    return result
  }

  private func dispatch(_ method: String, _ params: [String: Any]) async throws -> Any {
    switch method {
    case "ping":
      return ["pong": true, "clock_ns": uptimeNs()]
    case "status":
      return await status()
    case "permission.request":
      return await requestPermission()
    case "capture.probe":
      return try await probe()
    case "windows.list":
      return try await listWindows(params)
    case "frame.resolve":
      return try await resolveTarget(params["target"]).describe()
    case "frame.verify":
      return try await verify(params)
    case "overlay.show":
      return try await showOverlay(params)
    case "overlay.hide":
      // overlay_id: one outline; session_id: that session's outlines; neither: all.
      let id = params.str("overlay_id"), sid = params.str("session_id")
      await MainActor.run { Overlays.shared.hide(id: id, prefix: sid.map { "\($0):" }) }
      return ["hidden": id ?? sid.map { "session \($0)" } ?? "all"]
    case "record.schedule":
      return try await scheduleRecording(params)
    case "record.mark":
      return try await mark(params)
    case "session.create":
      return try await sessions.create(params)
    case "session.get":
      guard let id = params.str("session_id") else { throw RPCError.badParams("session_id is required") }
      var d = try await sessions.get(id, eventLimit: Int(params.num("events") ?? 30))
      d["recordings"] = await recordings.briefs(await sessions.recordingIDs(id))
      return d
    case "session.search":
      var d = await sessions.search(params)
      // Add what is running right now in each hit.
      if var hits = d["sessions"] as? [[String: Any]] {
        for i in hits.indices {
          let ids = await recordings.active(session: hits[i].str("session_id")).map(\.id)
          if !ids.isEmpty { hits[i]["recording_now"] = ids }
        }
        d["sessions"] = hits
      }
      return d
    case "session.note":
      guard let id = params.str("session_id"), let text = params.str("text") else {
        throw RPCError.badParams("session_id and text are required")
      }
      return try await sessions.note(id, text)
    case "session.update":
      return try await sessions.update(params)
    case "session.close", "session.reopen":
      guard let id = params.str("session_id") else { throw RPCError.badParams("session_id is required") }
      return try await sessions.close(id, reopen: method == "session.reopen")
    case "record.get":
      return try await recordings.get(try recID(params)).describe()
    case "record.list":
      return await recordings.list(params)
    case "record.stop":
      let r = try await recordings.get(try recID(params))
      r.stop()
      return try await recordings.wait(r.id, until: "done", timeout: params.num("timeout_s") ?? 10)
    case "record.cancel":
      let r = try await recordings.get(try recID(params))
      r.cancel()
      return try await recordings.wait(r.id, until: "done", timeout: 5)
    case "record.reschedule":
      let r = try await recordings.get(try recID(params))
      let start = try params["start_at"].map { v -> Date in
        guard let d = parseTime(v) else { throw RPCError.badParams("start_at must be ISO 8601 or unix seconds") }
        return d
      }
      let end = try params["end_at"].map { v -> Date in
        guard let d = parseTime(v) else { throw RPCError.badParams("end_at must be ISO 8601 or unix seconds") }
        return d
      }
      guard start != nil || end != nil else { throw RPCError.badParams("give start_at and/or end_at") }
      try r.reschedule(start: start, end: end)
      return r.describe()
    case "record.wait":
      let until = params.str("until") ?? "done"
      guard ["recording", "done"].contains(until) else { throw RPCError.badParams("until must be recording or done") }
      return try await recordings.wait(try recID(params), until: until, timeout: min(params.num("timeout_s") ?? 30, 3600))
    case "viewfinder.stop":
      await viewfinder.stop()
      return ["stopped": true]
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
      "viewfinder": await viewfinder.state,
      "overlays": await MainActor.run { Overlays.shared.active },
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

  /// Every recording belongs to a session the request names explicitly.
  private func scheduleRecording(_ p: [String: Any]) async throws -> [String: Any] {
    if let key = p.str("idempotency_key"), let existing = await recordings.byIdempotencyKey(key) {
      var d = existing.describe()
      d["reused"] = true
      return d
    }
    guard let sid = try await sessions.resolve(p, required: true, for: "record.schedule") else {
      throw RPCError(code: "internal", message: "could not open a session")
    }
    var d = try await recordings.schedule(p, sessionID: sid, sessionDir: await sessions.dir(sid))
    if let rid = d.str("recording_id"), d["reused"] == nil {
      await sessions.recordingAdded(sid, recordingID: rid, label: p.str("label") ?? "")
    }
    d["session_id"] = sid
    return d
  }

  /// Marks "now" in running recordings: one by id, or every running recording
  /// in the session. Without a running recording the mark still lands in the
  /// session log with its wall time.
  private func mark(_ p: [String: Any]) async throws -> [String: Any] {
    guard let label = p.str("label"), !label.isEmpty else { throw RPCError.badParams("label is required") }
    let kind = p.str("kind") ?? "mark"
    var targets: [Recording] = []
    var sid: String?
    if let rid = p.str("recording_id") {
      let r = try await recordings.get(rid)
      targets = [r]
      sid = r.sessionID
    } else {
      guard let id = p.str("session_id") else { throw RPCError.badParams("give recording_id, or session_id to mark every running recording in it") }
      guard await sessions.exists(id) else { throw RPCError(code: "not_found", message: "no session \(id)") }
      sid = id
      targets = await recordings.active(session: sid)
    }
    var applied: [[String: Any]] = []
    for r in targets {
      if let t = r.addMark(label, kind: kind) { applied.append(["recording_id": r.id, "t_s": t]) }
    }
    if let sid { await sessions.log(sid, "mark", ["label": label, "kind": kind, "recordings": applied]) }
    return ["label": label, "session_id": sid ?? NSNull(), "marked": applied,
            "note": applied.isEmpty ? "no recording was running; the mark is in the session log only" : ""]
  }

  private func recID(_ p: [String: Any]) throws -> String {
    guard let id = p.str("recording_id") else { throw RPCError.badParams("recording_id is required") }
    return id
  }

  /// Resolves against cached content first; a miss (new or moved window)
  /// retries once against a fresh listing.
  private func resolveTarget(_ raw: Any?) async throws -> ResolvedTarget {
    let spec = try TargetSpec.parse(raw)
    do {
      return try Targets.resolve(spec, content: try await Targets.content())
    } catch let e as RPCError where e.code == "target_not_found" {
      return try Targets.resolve(spec, content: try await Targets.content(fresh: true))
    }
  }

  private func listWindows(_ p: [String: Any]) async throws -> [String: Any] {
    let content = try await Targets.content(fresh: true)
    let all = Targets.listWindows(app: p.str("app"), title: p.str("title"), content: content,
                                  includeOffscreen: !(p.bool("on_screen_only") ?? false))
    let limit = Int(p.num("limit") ?? 50)
    return ["windows": all.prefix(limit).map(windowDict), "total": all.count]
  }

  /// Captures the target as it looks right now and writes an image the agent
  /// can look at. Uses the warm viewfinder stream when it can.
  private func verify(_ p: [String: Any]) async throws -> [String: Any] {
    let t0 = uptimeNs()
    let target = try await resolveTarget(p["target"])
    let t1 = uptimeNs()
    let maxWidth = Int(p.num("max_width") ?? 1280)
    let width = maxWidth > 0 ? maxWidth : nil
    let grab: Viewfinder.Grab
    // Already recording this exact area? Read that stream: no second capture,
    // and the check shows exactly what is being recorded.
    if let rec = await recordings.recording(covering: target.areaKey), let pb = rec.tap() {
      grab = Viewfinder.Grab(image: try cgImage(pb, maxWidth: width), source: "tap", ms: Double(uptimeNs() - t1) / 1e6)
    } else {
      grab = try await viewfinder.grab(target, maxWidth: width)
    }
    let format = p.str("format") == "png" ? "png" : "jpeg"
    // Frame checks go into a session only when one is named.
    let sid = try await sessions.resolve(p, required: false, for: "frame.verify")
    var frameDir = paths.frames
    if let sid {
      frameDir = await sessions.dir(sid) + "/frames"
      try? FileManager.default.createDirectory(atPath: frameDir, withIntermediateDirectories: true)
    }
    // Millisecond stamp plus a random suffix: concurrent checks never collide.
    let stamp = "\(Int(Date().timeIntervalSince1970 * 1000))-\(String(UInt32.random(in: 0...UInt32.max), radix: 36))"
    let path = p.str("path") ?? "\(frameDir)/verify-\(stamp).\(format == "png" ? "png" : "jpg")"
    let t2 = uptimeNs()
    let bytes = try ImageOut.write(grab.image, to: path, format: format, quality: p.num("quality") ?? 0.8)
    let t3 = uptimeNs()
    var checks = ImageOut.stats(grab.image)
    var warnings = target.warnings
    if checks["looks_blank"] as? Bool == true {
      warnings.append("image is nearly uniform; the target may be hidden, locked, minimized or not drawn yet")
    }
    checks["warnings"] = warnings
    pruneFrames()
    if let sid { await sessions.verified(sid, image: path, target: target.describe()) }
    return [
      "session_id": sid ?? NSNull(),
      "image": ["path": path, "w": grab.image.width, "h": grab.image.height, "bytes": bytes, "format": format],
      "target": target.describe(),
      "checks": checks,
      "timing_ms": ["resolve": Double(t1 - t0) / 1e6, "capture": grab.ms, "write": Double(t3 - t2) / 1e6,
                    "total": Double(t3 - t0) / 1e6, "source": grab.source],
      "clock_ns": t2,
    ]
  }

  private func showOverlay(_ p: [String: Any]) async throws -> [String: Any] {
    let target = try await resolveTarget(p["target"])
    // Outlines are namespaced by session so two agents never replace each
    // other's; ids that already carry a namespace are kept as given.
    let base = p.str("overlay_id") ?? "frame"
    let sid = p.str("session_id")
    let id = base.contains(":") ? base : "\(sid ?? "shared"):\(base)"
    let seconds = p.num("seconds") ?? 8
    let label = p.str("label")
    let capturable = p.bool("capturable") ?? false
    await MainActor.run { Overlays.shared.show(id: id, frame: target.frame, label: label, seconds: seconds, capturable: capturable) }
    // The engine only shows up in ScreenCaptureKit's app list once it owns a
    // window, so re-list now: later capture filters then exclude the outline.
    await ContentCache.shared.invalidate()
    return ["overlay_id": id, "frame": rectDict(target.frame), "seconds": seconds, "warnings": target.warnings]
  }

  private func pruneFrames() {
    let fm = FileManager.default
    let cutoff = Date().addingTimeInterval(-86400)
    for name in (try? fm.contentsOfDirectory(atPath: paths.frames)) ?? [] {
      let path = paths.frames + "/" + name
      if let m = (try? fm.attributesOfItem(atPath: path))?[.modificationDate] as? Date, m < cutoff {
        try? fm.removeItem(atPath: path)
      }
    }
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
