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
  private let maintenance = MaintenanceFence()
  private lazy var sessions = Sessions(root: paths.root + "/sessions")
  private lazy var recordings = Recordings(legacyRoot: paths.root + "/recordings", sessions: sessions)

  init(paths: Paths, lock: InstanceLock) {
    self.paths = paths
    self.lock = lock
  }

  func start() throws {
    _ = ExclusionApps.shared // install workspace observation on the main thread
    ActionTimeline.shared.configure(root:paths.root+"/actions")
    let actionRecordings=self.recordings
    ActionTimeline.shared.onChange = { value in Task { await actionRecordings.annotateAction(value) } }
    let server = SocketServer(path: paths.socket) { [unowned self] method, params in
      try await self.handle(method, params)
    }
    try server.start()
    self.server = server
    // Encoder finalization deadlines isolate the affected take. Unfinished
    // producers retain admission; an idle maintenance restart is an explicit
    // operational decision, never an automatic interruption of healthy peers.
    let recordings = self.recordings, sessions = self.sessions
    Task {
      await sessions.load()
      await recordings.load()
      self.maintenance.didLoad()
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
    let admitted = try maintenance.enter(method)
    defer {if admitted {maintenance.leave()}}
    let result = try await dispatch(method, params)
    // Every object reply carries the engine clock, so agents can compute
    // absolute start_at/end_at times without asking separately.
    if var d = result as? [String: Any], d["clock"] == nil {
      let ns=uptimeNs()
      d["clock"] = ["wall": iso8601.string(from: Date()), "uptime_ns": ns,"uptime_ns_exact":String(ns),"domain":"CLOCK_UPTIME_RAW"]
      return d
    }
    return result
  }

  private func dispatch(_ method: String, _ params: [String: Any]) async throws -> Any {
    try RPCNumber.validate(method,params)
    switch method {
    case "maintenance.status":
      return maintenance.status
    case "maintenance.validate":
      guard let token=params.str("token") else{throw RPCError.badParams("token is required")}
      try maintenance.validate(token);return ["lease":maintenance.status,"pid":Int(getpid()),"build":Build.hash]
    case "maintenance.restart":
      guard let token=params.str("token") else{throw RPCError.badParams("token is required")}
      try maintenance.commitRestart(token)
      Log.event("maintenance_restart",["pid":getpid(),"build":Build.hash])
      // Committing pins admission until actual exit. It cannot expire into
      // newly admitted peer work between authorization and process teardown.
      DispatchQueue.global().asyncAfter(deadline:.now()+0.1){exit(75)}
      return ["restart_committed":true,"pid":Int(getpid()),"lease":maintenance.status]
    case "maintenance.release":
      guard let token=params.str("token") else{throw RPCError.badParams("token is required")}
      try maintenance.release(token);return maintenance.status
    case "maintenance.acquire":
      let seconds=try RPCNumber.optional(params,"ttl_s",min:5,max:180) ?? 30
      let allow=try RPCNumber.boolean(params,"allow_unfinished_terminal") ?? false
      let token=try maintenance.reserve(seconds:seconds)
      var blockers=await recordings.maintenanceBlockers(allowUnfinishedTerminal:allow)
      let preview=await viewfinder.state
      if !(preview["lanes"] as? [[String:Any]] ?? []).isEmpty {blockers.append("preview lanes exist")}
      if !allow && preview["retiring"] as? Int != 0 {blockers.append("retiring previews remain")}
      let discovery=await ContentCache.shared.diagnostics
      if discovery["inflight"] as? Bool != false && !(allow && discovery["quarantined"] as? Bool == true) {blockers.append("SDK discovery is unfinished")}
      if InputTimeline.shared.status["subscribers"] as? Int != 0 {blockers.append("input subscribers remain")}
      if !allow && InputTimeline.shared.status["queued"] as? Int != 0 {blockers.append("input delivery is queued")}
      if ActionTimeline.shared.status["active"] as? Int != 0 {blockers.append("active action scopes remain")}
      if ManagedCommand.status()["pending"] as? Bool != false {blockers.append("export/probe child remains")}
      let outlines=await MainActor.run {Overlays.shared.active}
      if !outlines.isEmpty {blockers.append("overlays remain")}
      do {try maintenance.prepare(token,blockers:blockers)}
      catch {try? maintenance.release(token);throw error}
      return ["token":token,"lease":maintenance.status,"allow_unfinished_terminal":allow,
        "limits":["The holder must revalidate the token and PID immediately before maintenance","No bundle replacement, restart, user input lock or UI action has occurred"]]
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
    case "action.begin":
      guard let sid=params.str("session_id"), await sessions.exists(sid) else { throw RPCError.badParams("an existing session_id is required") }
      let resolution=try ActionTimeline.targetResolution(params)
      let target=try resolution=="declared" ? ActionTimeline.declaredTarget(params["target"]) : validateActionTarget(params["target"])
      return try ActionTimeline.shared.begin(params,target:target)
    case "action.end":
      guard let sid=params.str("session_id"),await sessions.exists(sid) else { throw RPCError.badParams("an existing session_id is required") }
      return try ActionTimeline.shared.end(params)
    case "action.list":
      guard let sid=params.str("session_id"),await sessions.exists(sid) else { throw RPCError.badParams("an existing session_id is required") }
      return ActionTimeline.shared.list(sessionID:sid,caller:params.str("caller"))
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
    case "record.export_info":
      let r = try await recordings.get(try recID(params))
      guard let name = params.str("name"),
            name.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\\.(mp4|gif)$", options: .regularExpression) != nil else {
        throw RPCError.badParams("name must identify a saved mp4/gif export in this recording")
      }
      let path = r.dir + "/exports/" + name + ".source.json"
      var metadata = stat()
      guard lstat(path, &metadata) == 0, metadata.st_mode & S_IFMT == S_IFREG,
            metadata.st_size > 0, metadata.st_size <= 32 * 1024 * 1024 else {
        throw RPCError(code: "no_derivative_source", message: "no bounded regular derivative manifest for this export")
      }
      return ["recording_id": r.id, "path": path, "schema": "record-screen-derivative/v1"]
    case "record.source":
      let d = try await recordings.get(try recID(params)).describe()
      return ["recording_id": d["recording_id"]!, "state": d["state"]!,
              "source_packet": d["source_packet"] ?? NSNull(), "video": d["video"] ?? NSNull(),
              "frames": d["frames"] ?? NSNull(), "frames_provenance": d["frames_provenance"] ?? "saved_manifest",
              "exclusion_quality":d["exclusion_quality"] ?? NSNull(),
              "video_outcome": (d["source_packet"] as? [String:Any])?["video_outcome"] ?? NSNull(),
              "limits": ["Journal gaps and draining status are explicit; footage can succeed without complete telemetry",
                         "A complete journal does not prove video finalization; failed/interrupted videos require decoded coverage before recovery",
                         "Interrupted manifest counters are checkpoints; decode partial footage to establish actual coverage",
                         "Transforms remain candidates outside qualified app and display geometry"]]
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
      return try await recordings.reschedule(r.id,start:start,end:end)
    case "record.review":
      return try await recordings.get(try recID(params)).reviewNow()
    case "record.frames":
      let r = try await recordings.get(try recID(params))
      guard let times = (params["at_s"] as? [Any])?.compactMap({ ($0 as? NSNumber)?.doubleValue }), !times.isEmpty, times.count <= 24 else {
        throw RPCError.badParams("at_s must be a list of 1–24 offsets in seconds")
      }
      guard FileManager.default.fileExists(atPath: r.videoPath) else { throw RPCError(code: "no_video", message: "recording \(r.id) has no video yet") }
      let mw = params.num("max_width").map { Int($0) } ?? 1024
      return ["recording_id": r.id, "frames": try await Review.frames(video: r.videoPath, at: times, outDir: r.dir + "/frames", maxWidth: mw > 0 ? mw : nil)]
    case "record.export":
      return try await export(params)
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
    let now = Date(), clockNS=uptimeNs()
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
      "clock": ["uptime_ns": clockNS, "uptime_ns_exact":String(clockNS), "domain":"CLOCK_UPTIME_RAW", "wall": iso8601.string(from: now), "started_ns": startedNs,"started_ns_exact":String(startedNs)],
      "permission": ["screen_recording": CGPreflightScreenCaptureAccess() ? "granted" : "missing"],
      "capabilities": ["strict_capture_requests":1,"application_filter":1,"target_capture_options": CaptureOptions.contractVersion, "source_journal": 1, "source_clock_continuity":1, "source_clock_instance":1,
                       "input_timeline":1,"input_tap_faults":1,"input_queue_loss":1,"action_scopes":1,"declared_action_targets":1,"derivative_source":1,"exclusion_identity":1,"preview_exclusion_identity":1,"encoder_failure_isolation":1,"stream_stop_diagnostics":1,"maintenance_fence":1,"sparse_frame_padding":1,"writer_failure_details":1,"transient_window_inventory":1],
      "maintenance":maintenance.status,
      "input_timeline":InputTimeline.shared.status,
      "action_timeline":ActionTimeline.shared.status,
      "displays": await displays(),
      "viewfinder": await viewfinder.state,
      "capture_health": ["discovery": await ContentCache.shared.diagnostics,
                         "recordings": await recordings.captureHealth,
                         "window_monitor":RecordingWindowContext.shared.status,"export_child":ManagedCommand.status(),
                         "exclusion_identity":ExclusionApps.shared.tracker.status,
                         "application_filter_identity":ExclusionApps.shared.tracker.status],
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

  private func validateActionTarget(_ raw: Any?) throws -> [String:Any] {
    guard let target=raw as? [String:Any],Set(target.keys).isSubset(of:["bundle_id","pid","window_id"]),
          let bundle=target.str("bundle_id"),!bundle.isEmpty,bundle.utf8.count<=256 else { throw RPCError.badParams("target needs an exact bundle_id with optional pid/window_id") }
    func identifier(_ key:String,_ maximum:Double) throws -> UInt32? {
      guard let raw=target[key] else { return nil }
      guard let n=raw as? NSNumber,CFGetTypeID(n) != CFBooleanGetTypeID(),n.doubleValue.isFinite,
            n.doubleValue>=1,n.doubleValue<=maximum,n.doubleValue.rounded(.towardZero)==n.doubleValue else { throw RPCError.badParams("invalid target.\(key)") }
      return UInt32(n.doubleValue)
    }
    let requested=try identifier("pid",Double(Int32.max)), window=try identifier("window_id",Double(UInt32.max))
    let matches=NSWorkspace.shared.runningApplications.filter{$0.bundleIdentifier==bundle && !$0.isTerminated && (requested==nil || UInt32($0.processIdentifier)==requested)}
    guard matches.count==1,let app=matches.first else { throw RPCError(code:"action_target_unavailable",message:"target bundle/PID is unavailable or ambiguous; specify its current PID") }
    var resolved:[String:Any]=["bundle_id":bundle,"pid":app.processIdentifier]
    if let window {
      guard let rows=CGWindowListCopyWindowInfo([.optionIncludingWindow],window) as? [[String:Any]],
            let row=rows.first(where: { ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value==window }), (row[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value==app.processIdentifier else { throw RPCError(code:"action_target_mismatch",message:"window is unavailable or no longer belongs to the requested app/PID") }
      resolved["window_id"]=window
    }
    return resolved
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

  /// A caller-chosen image path: absolute, an image extension, an existing
  /// folder, and never overwriting a file that isn't an image.
  static func safeImagePath(_ raw: String) throws -> String {
    let path = URL(fileURLWithPath: raw).standardizedFileURL.path
    let ext = (path as NSString).pathExtension.lowercased()
    var isDir: ObjCBool = false
    guard raw.hasPrefix("/"), ["jpg", "jpeg", "png"].contains(ext),
          FileManager.default.fileExists(atPath: (path as NSString).deletingLastPathComponent, isDirectory: &isDir), isDir.boolValue else {
      throw RPCError.badParams("path must be an absolute .jpg or .png path in an existing folder")
    }
    // Look at the leaf without following it: anything already there must be
    // a plain image file. A symlink would redirect the write elsewhere, and a
    // FIFO or device would block the read below.
    var st = stat()
    if lstat(path, &st) == 0 {
      guard (st.st_mode & S_IFMT) == S_IFREG else {
        throw RPCError.badParams("path exists and is not a regular file (symlink, pipe or device); refusing to write there")
      }
      let fd = open(path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
      guard fd >= 0 else { throw RPCError.badParams("path exists but can't be read; refusing to overwrite it") }
      var head = [UInt8](repeating: 0, count: 4)
      let n = read(fd, &head, 4)
      close(fd)
      let isImage = n == 4 && (head.starts(with: [0xFF, 0xD8, 0xFF]) || head.starts(with: [0x89, 0x50, 0x4E, 0x47]))
      guard isImage else { throw RPCError.badParams("path exists and is not an image; refusing to overwrite it") }
    }
    return path
  }

  /// Trim (mp4) or GIF a finished recording, by seconds or by mark labels.
  private func export(_ p: [String: Any]) async throws -> [String: Any] {
    let r = try await recordings.get(try recID(p))
    let d = r.describe()
    guard FileManager.default.fileExists(atPath: r.videoPath), r.state.terminal else {
      throw RPCError(code: "not_finished", message: "recording \(r.id) is \(r.state.rawValue); export works on finished recordings")
    }
    let format = p.str("format") ?? "mp4"
    guard ["mp4", "gif"].contains(format) else { throw RPCError.badParams("format must be mp4 or gif") }
    let marks = d["marks"] as? [[String: Any]] ?? []
    func markT(_ label: String) throws -> Double {
      guard let m = marks.first(where: { $0.str("label") == label }), let t = m.num("t_s") else {
        throw RPCError.badParams("no mark \"\(label)\"; marks: \(marks.compactMap { $0.str("label") })")
      }
      return t
    }
    let duration = ((d["review"] as? [String: Any])?.num("duration_s"))
      ?? (parseTime(d["end_at"] ?? "").flatMap { e in parseTime(d["start_at"] ?? "").map { e.timeIntervalSince($0) } } ?? 0)
    let from = try p.str("from_mark").map(markT) ?? p.num("from_s") ?? 0
    let to = try p.str("to_mark").map(markT) ?? p.num("to_s") ?? duration
    guard to > from else { throw RPCError.badParams("the end of the export must be after its start (from \(from) s, to \(to) s)") }
    if format == "gif" && to - from > 60 { throw RPCError.badParams("GIFs are capped at 60 s; export mp4 for longer clips") }
    let name = p.str("name") ?? String(format: "%@-%.3f-%.3f-%@.%@", format == "gif" ? "clip" : "trim", from, to, String(UUID().uuidString.prefix(8)).lowercased(), format)
    // A plain file name only: exports never leave the recording's folder.
    guard name.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$", options: .regularExpression) != nil,
          (name as NSString).pathExtension.lowercased() == format else {
      throw RPCError.badParams("name must be a plain file name (letters, digits, . _ -) ending in .\(format)")
    }
    let exportsDir = URL(fileURLWithPath: r.dir + "/exports").standardizedFileURL.path
    let out = URL(fileURLWithPath: exportsDir + "/" + name).standardizedFileURL.path
    guard out.hasPrefix(exportsDir + "/") else { throw RPCError.badParams("name escapes the exports folder") }
    return try await Export.run(video: r.videoPath, out: out, format: format, from: from, to: to,
                                maxWidth: p.num("max_width"), fps: p.num("fps"),
                                effort: p.str("effort") ?? "standard", backend: p.str("backend"),
                                parentIdentity: ["recording_id": r.id, "source_packet": d["source_packet"] ?? NSNull(),
                                                 "video_outcome": (d["source_packet"] as? [String:Any])?["video_outcome"] ?? NSNull()])
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
    let transients = try RPCNumber.boolean(p, "include_transients") ?? false
    let content = try await Targets.content(fresh: true)
    let all = Targets.listWindows(app: p.str("app"), title: p.str("title"), content: content,
                                  includeOffscreen: !(p.bool("on_screen_only") ?? false), includeTransients: transients)
    let limit = Int(p.num("limit") ?? 50)
    return ["windows": all.prefix(limit).map(windowDict), "total": all.count,
      "inventory_scope": transients ? "including_transients" : "normal",
      "limits": ["Inventory membership and proximity do not establish parent ownership or captured pixels",
                 "Use exact window IDs for helper/panel targets and verify current identity and encoded content"]]
  }

  /// Captures the target as it looks right now and writes an image the agent
  /// can look at. Uses the warm viewfinder stream when it can.
  private func verify(_ p: [String: Any]) async throws -> [String: Any] {
    let t0 = uptimeNs()
    let spec = try TargetSpec.parse(p["target"])
    // The request lease spans resolution, a recording tap or lane, and image
    // publication. The lane has its own lease across later requests.
    let requestLease = spec.options.identityBundles.isEmpty ? nil :
      try ExclusionApps.shared.tracker.subscribe(spec.options.identityBundles, role:spec.options.identityRole, onChange: { _ in })
    defer { if let requestLease { ExclusionApps.shared.tracker.unsubscribe(requestLease) } }
    let target = try await resolveTarget(p["target"])
    var resolved: [String:Set<Int32>] = [:]
    for app in target.identityApplications { resolved[app.bundleIdentifier, default: []].insert(app.processID) }
    try requestLease?.validateResolved(resolved)
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
    let path = try p.str("path").map(Self.safeImagePath) ?? "\(frameDir)/verify-\(stamp).\(format == "png" ? "png" : "jpg")"
    let t2 = uptimeNs()
    try requestLease?.validate()
    let bytes = try ImageOut.write(grab.image, to: path, format: format, quality: p.num("quality") ?? 0.8)
    do { try requestLease?.validate() }
    catch { try? FileManager.default.removeItem(atPath: path); throw error }
    let t3 = uptimeNs()
    var checks = ImageOut.stats(grab.image)
    var warnings = target.warnings
    if checks["looks_blank"] as? Bool == true {
      warnings.append("image is nearly uniform; the target may be hidden, locked, minimized or not drawn yet")
    }
    checks["warnings"] = warnings
    pruneFrames()
    if let sid { await sessions.verified(sid, image: path, target: target.describe()) }
    try requestLease?.validate()
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
