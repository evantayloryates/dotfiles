import AppKit
import AVFoundation
import IOKit.pwr_mgt
import ScreenCaptureKit

/// Output settings for one recording. Presets cover the common cases; any
/// field can be overridden per recording.
struct RecordSettings {
  var preset: String
  var fps: Int
  var codec: String  // h264 | hevc
  var maxWidth: Int?  // nil = native pixels
  var showCursor: Bool
  var bitsPerPixel: Double  // bitrate = w * h * fps * bitsPerPixel
  var bitrateMbps: Double?

  static func from(_ p: [String: Any]) throws -> RecordSettings {
    let preset = p.str("preset") ?? "evidence"
    var s: RecordSettings
    switch preset {
    // Small and readable: 1 point per pixel, 30 fps.
    case "evidence": s = RecordSettings(preset: preset, fps: 30, codec: "h264", maxWidth: -1, showCursor: false, bitsPerPixel: 0.06)
    // Full Retina detail at 60 fps for demos.
    case "demo": s = RecordSettings(preset: preset, fps: 60, codec: "h264", maxWidth: nil, showCursor: false, bitsPerPixel: 0.04)
    // Fits a PR description or chat: 1280 wide, 30 fps.
    case "pr-clip": s = RecordSettings(preset: preset, fps: 30, codec: "h264", maxWidth: 1280, showCursor: false, bitsPerPixel: 0.08)
    default: throw RPCError.badParams("unknown preset \(preset); use evidence, demo or pr-clip")
    }
    if let v = p.num("fps") { s.fps = max(1, min(120, Int(v))) }
    if let v = p.str("codec") {
      guard ["h264", "hevc"].contains(v) else { throw RPCError.badParams("codec must be h264 or hevc") }
      s.codec = v
    }
    if let v = p.num("max_width") { s.maxWidth = v <= 0 ? nil : Int(v) }
    if let v = p.bool("show_cursor") { s.showCursor = v }
    if let v = p.num("bitrate_mbps") { s.bitrateMbps = v }
    return s
  }

  /// Rebuilds settings from a saved manifest.
  static func fromSaved(_ d: [String: Any]) -> RecordSettings {
    var p: [String: Any] = ["preset": d.str("preset") ?? "evidence"]
    for k in ["fps", "codec", "show_cursor", "bitrate_mbps"] { if let v = d[k] { p[k] = v } }
    var s = (try? from(p)) ?? (try! from(["preset": "evidence"]))
    switch d.str("max_width") {
    case "points": s.maxWidth = -1
    case "native": s.maxWidth = nil
    case let v?: s.maxWidth = Int(v)
    case nil: break
    }
    return s
  }

  var dict: [String: Any] {
    var d: [String: Any] = ["preset": preset, "fps": fps, "codec": codec, "show_cursor": showCursor]
    d["max_width"] = maxWidth.map { $0 < 0 ? "points" : "\($0)" } ?? "native"
    if let b = bitrateMbps { d["bitrate_mbps"] = b }
    return d
  }
}

enum RecState: String {
  case scheduled, arming, recording, finalizing, done, failed, canceled, missed, interrupted
  var terminal: Bool { [.done, .failed, .canceled, .missed, .interrupted].contains(self) }
}

/// One scheduled recording, from arming through a finished file. All mutable
/// state lives on `q`, which is also where ScreenCaptureKit delivers frames.
final class Recording: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
  static let prerollSeconds = 1.0

  let id: String
  let dir: String
  let targetRaw: [String: Any]
  let settings: RecordSettings
  let label: String
  let idempotencyKey: String?
  let createdAt: Date
  private(set) var startAt: Date
  private(set) var endAt: Date
  let ifLate: String  // start | skip

  let q: DispatchQueue
  private(set) var state: RecState = .scheduled
  private var events: [[String: Any]] = []
  private var error: String?
  private var resolved: [String: Any]?

  private var stream: SCStream?
  private var writer: AVAssetWriter?
  private var input: AVAssetWriterInput?
  private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
  private var startHostNs: UInt64 = 0
  private var endHostNs: UInt64 = 0
  private var actualStart: Date?
  private var actualEnd: Date?
  private var prerollBuffer: CVPixelBuffer?
  private var lastBuffer: CVPixelBuffer?
  private var lastWrittenNs: UInt64 = 0
  private var wroteFirst = false
  private var framesWritten = 0
  private var framesDropped = 0
  private var framesSeen = 0
  private var firstFrameDelayMs: Double?
  private var armTimer: DispatchSourceTimer?
  private var startTimer: DispatchSourceTimer?
  private var endTimer: DispatchSourceTimer?
  private var monitorTimer: DispatchSourceTimer?
  private var powerAssertion: IOPMAssertionID = 0
  private var watchedWindow: (id: CGWindowID, frame: CGRect, pid: pid_t)?
  private var wasHidden = false
  private var wasOnScreen = true
  private var windowGone = false
  var onChange: (@Sendable (Recording) -> Void)?

  var videoPath: String { dir + "/video.mp4" }
  var manifestPath: String { dir + "/recording.json" }

  init(id: String, dir: String, target: [String: Any], settings: RecordSettings, label: String, startAt: Date, endAt: Date,
       ifLate: String, idempotencyKey: String?, createdAt: Date = Date(), state: RecState = .scheduled) {
    self.id = id
    self.dir = dir
    self.targetRaw = target
    self.settings = settings
    self.label = label
    self.startAt = startAt
    self.endAt = endAt
    self.ifLate = ifLate
    self.idempotencyKey = idempotencyKey
    self.createdAt = createdAt
    self.state = state
    self.q = DispatchQueue(label: "record-screen.rec.\(id)", qos: .userInteractive)
  }

  // MARK: - Scheduling

  /// Sets the arm timer. Called on creation and after a reschedule or reload.
  func schedule() {
    q.async { [self] in
      guard state == .scheduled else { return }
      armTimer?.cancel()
      let now = Date()
      if endAt <= now {
        finish(.missed, reason: "end_at passed before the recording could start")
        return
      }
      if startAt < now.addingTimeInterval(-2) && ifLate == "skip" {
        finish(.missed, reason: "start_at passed and if_late is skip")
        return
      }
      let armAt = startAt.addingTimeInterval(-Self.prerollSeconds)
      armTimer = wallTimer(at: armAt) { [weak self] in self?.arm() }
    }
  }

  func reschedule(start: Date?, end: Date?) throws {
    let stillScheduled: Bool = try q.sync {
      switch state {
      case .scheduled:
        let newStart = start ?? startAt, newEnd = end ?? endAt
        guard newEnd > newStart else { throw RPCError.badParams("end_at must be after start_at") }
        startAt = newStart
        endAt = newEnd
      case .arming, .recording:
        guard start == nil else { throw RPCError(code: "already_started", message: "recording \(id) already started; only end_at can change") }
        guard let end else { return false }
        guard end > Date() else { throw RPCError.badParams("end_at must be in the future") }
        endAt = end
        endHostNs = hostNs(for: end)
        endTimer?.cancel()
        endTimer = wallTimer(at: end.addingTimeInterval(0.15)) { [weak self] in self?.finalize(reason: nil) }
        note("end_moved", ["end_at": iso8601.string(from: end)])
      default:
        throw RPCError(code: "finished", message: "recording \(id) is \(state.rawValue)")
      }
      persist()
      return state == .scheduled
    }
    if stillScheduled { schedule() }
  }

  /// Restores what a saved manifest knows (after an engine restart). A
  /// recording that was mid-flight becomes `interrupted`.
  func restore(from m: [String: Any], interrupted: Bool) {
    q.async { [self] in
      events = m["events"] as? [[String: Any]] ?? []
      resolved = m["resolved"] as? [String: Any]
      error = m.str("error")
      actualStart = m.str("actual_start").flatMap(parseISO)
      actualEnd = m.str("actual_end").flatMap(parseISO)
      firstFrameDelayMs = m.num("first_frame_delay_ms")
      if let f = m["frames"] as? [String: Any] {
        framesWritten = Int(f.num("written") ?? 0)
        framesDropped = Int(f.num("dropped") ?? 0)
        framesSeen = Int(f.num("seen") ?? 0)
      }
      if interrupted {
        error = "the engine stopped during this recording; the file keeps everything up to its last full second"
        persist()
      }
    }
  }

  /// Writes the manifest now (used right after creation).
  func save() { q.async { [self] in persist() } }

  /// Stops now and keeps the file.
  func stop() {
    q.async { [self] in
      switch state {
      case .scheduled:
        finish(.canceled, reason: "stopped before it started")
      case .arming:
        teardownStream()
        finish(.canceled, reason: "stopped before start_at")
      case .recording:
        endHostNs = min(endHostNs, uptimeNs())
        note("stopped_early", [:])
        finalize(reason: nil)
      default: break
      }
    }
  }

  /// Stops and deletes the file.
  func cancel() {
    q.async { [self] in
      guard !state.terminal else { return }
      teardownStream()
      writer?.cancelWriting()
      try? FileManager.default.removeItem(atPath: videoPath)
      finish(.canceled, reason: "canceled")
    }
  }

  // MARK: - Arming and capture

  private func arm() {
    guard state == .scheduled else { return }
    let now = Date()
    let lateBy = now.timeIntervalSince(startAt)
    if lateBy > 2 {
      if ifLate == "skip" { finish(.missed, reason: "armed \(Int(lateBy)) s late and if_late is skip"); return }
      note("started_late", ["late_s": lateBy])
    }
    setState(.arming)
    // Map wall-clock times onto the host clock that frame timestamps use.
    startHostNs = hostNs(for: max(startAt, now))
    endHostNs = hostNs(for: endAt)
    holdPower()
    Task { await self.startCapture() }
  }

  private func startCapture() async {
    do {
      let spec = try TargetSpec.parse(targetRaw)
      var content = try await Targets.content(fresh: true)
      let target: ResolvedTarget
      do {
        target = try Targets.resolve(spec, content: content)
      } catch {
        content = try await Targets.content(fresh: true)
        target = try Targets.resolve(spec, content: content)
      }
      let width = settings.maxWidth == -1 ? Int(target.frame.width) : settings.maxWidth
      let cfg = target.configuration(maxWidth: width, pixelFormat: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
                                     showsCursor: settings.showCursor)
      cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(settings.fps))
      cfg.queueDepth = 8
      try q.sync { try makeWriter(width: cfg.width, height: cfg.height) }
      let s = SCStream(filter: target.filter, configuration: cfg, delegate: self)
      try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: q)
      q.sync {
        resolved = target.describe()
        if let w = target.window {
          watchedWindow = (w.windowID, target.frame, w.owningApplication?.processID ?? 0)
          wasOnScreen = Targets.liveWindowState(w.windowID)?.onScreen ?? w.isOnScreen
          wasHidden = NSRunningApplication(processIdentifier: w.owningApplication?.processID ?? 0)?.isHidden ?? false
        }
        for warning in target.warnings { note("warning", ["message": warning]) }
        stream = s
      }
      try await s.startCapture()
      q.async { [self] in
        guard state == .arming else { return }
        let toStart = Double(Int64(startHostNs) - Int64(uptimeNs())) / 1e9
        startTimer = delayTimer(max(0, toStart) + 0.005) { [weak self] in self?.beginAtStart() }
        endTimer = wallTimer(at: endAt.addingTimeInterval(0.15)) { [weak self] in self?.finalize(reason: nil) }
        monitorTimer = repeatingTimer(1.0) { [weak self] in self?.monitor() }
        persist()
      }
    } catch {
      q.async { [self] in
        teardownStream()
        writer?.cancelWriting()
        try? FileManager.default.removeItem(atPath: videoPath)
        let msg = (error as? RPCError)?.message ?? "\(error)"
        finish(.failed, reason: "could not start: \(msg)")
      }
    }
  }

  private func makeWriter(width: Int, height: Int) throws {
    try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    try? FileManager.default.removeItem(atPath: videoPath)
    let w = try AVAssetWriter(outputURL: URL(fileURLWithPath: videoPath), fileType: .mp4)
    // Fragments every second: a crash or power loss still leaves a playable file.
    w.movieFragmentInterval = CMTime(seconds: 1, preferredTimescale: 600)
    let bitrate = settings.bitrateMbps.map { $0 * 1e6 } ?? Double(width * height * settings.fps) * settings.bitsPerPixel
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: settings.codec == "hevc" ? AVVideoCodecType.hevc : AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: Int(max(bitrate, 500_000)),
        AVVideoExpectedSourceFrameRateKey: settings.fps,
        AVVideoMaxKeyFrameIntervalDurationKey: 2,
        AVVideoAllowFrameReorderingKey: false,
      ],
    ])
    input.expectsMediaDataInRealTime = true
    guard w.canAdd(input) else { throw RPCError(code: "writer", message: "cannot configure the video writer") }
    w.add(input)
    adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
    guard w.startWriting() else { throw RPCError(code: "writer", message: "cannot start writing: \(w.error?.localizedDescription ?? "")") }
    writer = w
    self.input = input
  }

  func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen, state == .arming || state == .recording,
          let info = (CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]])?.first,
          let raw = info[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete,
          let pb = CMSampleBufferGetImageBuffer(sb) else { return }
    framesSeen += 1
    let pts = UInt64(max(0, sb.presentationTimeStamp.seconds) * 1e9)
    lastBuffer = pb
    if pts < startHostNs {
      prerollBuffer = pb  // the screen as it is just before start_at
      return
    }
    if pts > endHostNs { return }
    if !wroteFirst { beginAtStart() }
    append(pb, at: pts)
  }

  func stream(_ s: SCStream, didStopWithError error: Error) {
    q.async { [self] in
      guard state == .arming || state == .recording else { return }
      let gone = watchedWindow.map { Targets.liveWindowState($0.id) == nil } ?? false
      if !(gone && windowGone) { note(gone ? "window_gone" : "capture_stopped", ["error": error.localizedDescription]) }
      endHostNs = min(endHostNs, uptimeNs())
      finalize(reason: gone ? "the target window closed; the file ends there" : "capture stopped: \(error.localizedDescription)")
    }
  }

  /// Puts the first frame at exactly start_at: the newest pre-roll frame if
  /// the screen hasn't changed since, otherwise the frame that just arrived.
  private func beginAtStart() {
    guard !wroteFirst, state == .arming, let writer else { return }
    writer.startSession(atSourceTime: cmTime(startHostNs))
    wroteFirst = true
    actualStart = Date().addingTimeInterval(-Double(Int64(uptimeNs()) - Int64(startHostNs)) / 1e9)
    setState(.recording)
    if let pre = prerollBuffer {
      append(pre, at: startHostNs)
      prerollBuffer = nil
    }
  }

  private func append(_ pb: CVPixelBuffer, at ns: UInt64) {
    guard let input, let adaptor, ns >= startHostNs, ns <= endHostNs, ns > lastWrittenNs || framesWritten == 0 else { return }
    guard input.isReadyForMoreMediaData else { framesDropped += 1; return }
    if adaptor.append(pb, withPresentationTime: cmTime(ns)) {
      if framesWritten == 0 { firstFrameDelayMs = Double(Int64(uptimeNs()) - Int64(startHostNs)) / 1e6 }
      framesWritten += 1
      lastWrittenNs = ns
    } else {
      framesDropped += 1
    }
  }

  // MARK: - Finishing

  private func finalize(reason: String?) {
    guard state == .recording || state == .arming else { return }
    let wasRecording = wroteFirst
    setState(.finalizing)
    stopTimers(keepArm: false)
    teardownStream()
    guard wasRecording, let writer, let input else {
      writer?.cancelWriting()
      try? FileManager.default.removeItem(atPath: videoPath)
      finish(.failed, reason: reason ?? "no frames arrived before end_at")
      return
    }
    // A static screen sends one frame and then nothing: repeat the last frame
    // just before the end so the file lasts the full window.
    let frameNs = UInt64(1e9 / Double(settings.fps))
    if let last = lastBuffer, endHostNs > lastWrittenNs + frameNs {
      append(last, at: endHostNs - frameNs)
    }
    input.markAsFinished()
    writer.endSession(atSourceTime: cmTime(endHostNs))
    actualEnd = Date().addingTimeInterval(-Double(Int64(uptimeNs()) - Int64(endHostNs)) / 1e9)
    writer.finishWriting { [self] in
      q.async { [self] in
        if writer.status == .completed {
          finish(reason == nil ? .done : .interrupted, reason: reason)
        } else {
          finish(.failed, reason: "writer failed: \(writer.error?.localizedDescription ?? "unknown")")
        }
      }
    }
  }

  private func finish(_ s: RecState, reason: String?) {
    if let reason { error = reason }
    stopTimers(keepArm: false)
    releasePower()
    prerollBuffer = nil
    lastBuffer = nil
    setState(s)
  }

  private func teardownStream() {
    if let s = stream { Task { try? await s.stopCapture() } }
    stream = nil
  }

  private func stopTimers(keepArm: Bool) {
    if !keepArm { armTimer?.cancel(); armTimer = nil }
    startTimer?.cancel(); startTimer = nil
    endTimer?.cancel(); endTimer = nil
    monitorTimer?.cancel(); monitorTimer = nil
  }

  // MARK: - Watching for disturbances

  /// Once a second: did the target window move, resize, hide or vanish?
  private func monitor() {
    guard state == .recording, let w = watchedWindow else { return }
    guard let live = Targets.liveWindowState(w.id) else {
      if !windowGone { note("window_gone", [:]); windowGone = true }
      return
    }
    if live.frame.size != w.frame.size { note("window_resized", ["frame": rectDict(live.frame)]) }
    else if live.frame.origin != w.frame.origin { note("window_moved", ["frame": rectDict(live.frame)]) }
    watchedWindow?.frame = live.frame
    let hidden = NSRunningApplication(processIdentifier: w.pid)?.isHidden ?? false
    if hidden != wasHidden { note(hidden ? "app_hidden" : "app_unhidden", [:]); wasHidden = hidden }
    if live.onScreen != wasOnScreen { note(live.onScreen ? "window_on_screen" : "window_off_screen", [:]); wasOnScreen = live.onScreen }
  }

  private func note(_ kind: String, _ detail: [String: Any]) {
    var e = detail
    e["kind"] = kind
    e["at"] = iso8601.string(from: Date())
    if startHostNs > 0 { e["t_s"] = (Double(Int64(uptimeNs()) - Int64(startHostNs)) / 1e9 * 1000).rounded() / 1000 }
    events.append(e)
    Log.event("recording_event", ["recording_id": id, "kind": kind])
    persist()
  }

  // MARK: - State and persistence

  private func setState(_ s: RecState) {
    state = s
    persist()
    Log.event("recording_state", ["recording_id": id, "state": s.rawValue])
    onChange?(self)
  }

  /// Snapshot for API replies and the manifest. Call on `q`.
  func describeLocked() -> [String: Any] {
    var d: [String: Any] = [
      "recording_id": id,
      "state": state.rawValue,
      "label": label,
      "target": targetRaw,
      "settings": settings.dict,
      "start_at": iso8601.string(from: startAt),
      "end_at": iso8601.string(from: endAt),
      "if_late": ifLate,
      "created_at": iso8601.string(from: createdAt),
      "dir": dir,
      "events": events,
      "frames": ["written": framesWritten, "dropped": framesDropped, "seen": framesSeen],
    ]
    if let k = idempotencyKey { d["idempotency_key"] = k }
    if let r = resolved { d["resolved"] = r }
    if let e = error { d["error"] = e }
    if let a = actualStart { d["actual_start"] = iso8601.string(from: a) }
    if let a = actualEnd { d["actual_end"] = iso8601.string(from: a) }
    if let f = firstFrameDelayMs { d["first_frame_delay_ms"] = (f * 10).rounded() / 10 }
    if FileManager.default.fileExists(atPath: videoPath) {
      let bytes = (try? FileManager.default.attributesOfItem(atPath: videoPath)[.size] as? Int) ?? 0
      d["video"] = ["path": videoPath, "bytes": bytes]
    }
    return d
  }

  func describe() -> [String: Any] { q.sync { describeLocked() } }

  private func persist() {
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    guard let data = try? JSONSerialization.data(withJSONObject: describeLocked(), options: [.prettyPrinted, .sortedKeys]) else { return }
    let tmp = manifestPath + ".tmp"
    FileManager.default.createFile(atPath: tmp, contents: data)
    _ = try? FileManager.default.replaceItemAt(URL(fileURLWithPath: manifestPath), withItemAt: URL(fileURLWithPath: tmp))
    if !FileManager.default.fileExists(atPath: manifestPath) { try? FileManager.default.moveItem(atPath: tmp, toPath: manifestPath) }
  }

  // MARK: - Helpers

  private func hostNs(for date: Date) -> UInt64 {
    let delta = date.timeIntervalSinceNow
    return UInt64(max(0, Int64(uptimeNs()) + Int64(delta * 1e9)))
  }

  private func cmTime(_ ns: UInt64) -> CMTime { CMTime(value: CMTimeValue(ns), timescale: 1_000_000_000) }

  private func wallTimer(at date: Date, _ fire: @escaping () -> Void) -> DispatchSourceTimer {
    let t = DispatchSource.makeTimerSource(flags: .strict, queue: q)
    let secs = date.timeIntervalSince1970
    let ts = timespec(tv_sec: Int(secs), tv_nsec: Int((secs - floor(secs)) * 1e9))
    t.schedule(wallDeadline: DispatchWallTime(timespec: ts), leeway: .milliseconds(1))
    t.setEventHandler(handler: fire)
    t.resume()
    return t
  }

  private func delayTimer(_ seconds: Double, _ fire: @escaping () -> Void) -> DispatchSourceTimer {
    let t = DispatchSource.makeTimerSource(flags: .strict, queue: q)
    t.schedule(deadline: .now() + seconds, leeway: .milliseconds(1))
    t.setEventHandler(handler: fire)
    t.resume()
    return t
  }

  private func repeatingTimer(_ every: Double, _ fire: @escaping () -> Void) -> DispatchSourceTimer {
    let t = DispatchSource.makeTimerSource(queue: q)
    t.schedule(deadline: .now() + every, repeating: every, leeway: .milliseconds(50))
    t.setEventHandler(handler: fire)
    t.resume()
    return t
  }

  /// Keeps the display awake from arming to the finished file.
  private func holdPower() {
    guard powerAssertion == 0 else { return }
    IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleDisplaySleep as CFString, IOPMAssertionLevel(kIOPMAssertionLevelOn),
                                "record-screen \(id)" as CFString, &powerAssertion)
  }

  private func releasePower() {
    if powerAssertion != 0 { IOPMAssertionRelease(powerAssertion); powerAssertion = 0 }
  }
}
