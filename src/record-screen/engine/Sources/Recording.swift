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
    if let v = try RPCNumber.optional(p,"fps",min:1,max:120,integer:true) { s.fps=Int(v) }
    if let v = p.str("codec") {
      guard ["h264", "hevc"].contains(v) else { throw RPCError.badParams("codec must be h264 or hevc") }
      s.codec = v
    }
    if let v = try RPCNumber.optional(p,"max_width",min:0,max:16384,integer:true) { s.maxWidth = v == 0 ? nil : Int(v) }
    if let v = try RPCNumber.boolean(p,"show_cursor") { s.showCursor = v }
    if let v = try RPCNumber.optional(p,"bitrate_mbps",min:0.1,max:1000) { s.bitrateMbps = v }
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
    case let v?: if let n=Int(v),n>=2,n<=16384 { s.maxWidth=n }
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
  let inputSettings: InputSettings
  let label: String
  let idempotencyKey: String?
  let sessionID: String?
  let createdAt: Date
  /// Optional embedding preflight and deadline injection for deterministic
  /// qualification. Neither is exposed over RPC; production uses nil / 8 s.
  private let startupPreflight: (@Sendable () async throws -> Void)?
  private let startupBudgetSeconds: Double
  // Written only on `q` (under snapLock); read anywhere through the accessors.
  private var _startAt: Date
  private var _endAt: Date
  var startAt: Date { snapLock.withLock { _startAt } }
  var endAt: Date { snapLock.withLock { _endAt } }
  let ifLate: String  // start | skip

  let q: DispatchQueue
  /// API calls never wait on `q`: under load the hardware encoder can stall
  /// it (seen at 24 simultaneous recordings), and a blocked `q` must not take
  /// the whole engine down with it. They read these lock-protected copies.
  private let snapLock = NSLock()
  private var _state: RecState = .scheduled
  private var snapshot: [String: Any] = [:]
  private var tapBuffer: CVPixelBuffer?
  private var startHostSnap: UInt64 = 0
  /// Set once the encoder has finished the file: the stall watchdog stands
  /// down (building the review afterwards can take a few seconds).
  private var writerDone = false
  private var startupPending = false
  private var encoderPending = false
  private var encoderCallsPending = false
  private var streamStopsPending = 0
  private var streamStopFailures = 0
  private var terminalReason: String?
  var state: RecState { snapLock.withLock { _state } }
  var holdsUnfinishedAdmission: Bool { snapLock.withLock { startupPending || encoderPending || encoderCallsPending || streamStopsPending > 0 } }
  var captureQuarantined: Bool { snapLock.withLock { _state.terminal && (startupPending || encoderPending || encoderCallsPending || streamStopsPending > 0) } }
  private var unfinishedWork: [String:Any] { snapLock.withLock {
    ["startup":startupPending,"encoder_finalization":encoderPending,"encoder_calls":encoderCallsPending,"stream_stops":streamStopsPending,"stream_stop_failures":streamStopFailures,
     "admission_held":startupPending || encoderPending || encoderCallsPending || streamStopsPending > 0]
  } }
  #if RECORD_SCREEN_QUALIFICATION
  // Private qualification builds only: block the real finalization queue
  // before encoder calls. This does not assert a natural hardware failure.
  var qualificationFinalizeBudget = 15.0
  var qualificationBeforeEncoderFinish: (@Sendable () -> Void)?
  #endif
  private var events: [[String: Any]] = []
  private var marks: [[String: Any]] = []
  private let activity = ActivityTracker()
  private var review: [String: Any]?
  private var activityTimeline: [Double]?
  private var error: String?
  private var resolved: [String: Any]?
  private var exclusionLease:ExclusionIdentityLease?
  private var exclusionQuality:[String:Any]?

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
  private var sourceJournal: SourceJournal?
  private var restoredSource: [String: Any]?
  private var sourceSequence = 0
  private var geometrySequence = -1
  private var previousGeometry: Data?
  private var previousColor: CaptureColor?
  private var colorSequence = -1
  private var receiptClockSegment = 0
  private var lastReceiptClockNS: UInt64?
  private var hostClockInterrupted = false
  private var prerollSource: Int?
  private var lastSource: Int?
  private var framesProvenance = "live_counters"
  private var inputEndHostSnap: UInt64 = 0
  private var armTimer: DispatchSourceTimer?
  private var startTimer: DispatchSourceTimer?
  private var endTimer: DispatchSourceTimer?
  private var monitorTimer: DispatchSourceTimer?
  private var powerAssertion: IOPMAssertionID = 0
  private let powerLock = NSLock()
  private var watchedWindow: (id: CGWindowID, frame: CGRect, pid: pid_t)?
  private var windowMonitorGapReported=false
  private var wasHidden = false
  private var wasOnScreen = true
  /// What this recording covers (ResolvedTarget.areaKey), for verify taps.
  private(set) var areaKey: String?
  private var windowGone = false
  var onChange: (@Sendable (Recording) -> Void)?

  var videoPath: String { dir + "/video.mp4" }
  var manifestPath: String { dir + "/recording.json" }

  init(id: String, dir: String, target: [String: Any], settings: RecordSettings, label: String, startAt: Date, endAt: Date,
       ifLate: String, idempotencyKey: String?, sessionID: String?, createdAt: Date = Date(), state: RecState = .scheduled,
       startupPreflight: (@Sendable () async throws -> Void)? = nil, startupBudgetSeconds: Double = 8,
       inputSettings: InputSettings = .disabled) {
    self.id = id
    self.dir = dir
    self.targetRaw = target
    self.settings = settings
    self.inputSettings = inputSettings
    self.label = label
    self._startAt = startAt
    self._endAt = endAt
    self.ifLate = ifLate
    self.idempotencyKey = idempotencyKey
    self.sessionID = sessionID
    self.createdAt = createdAt
    precondition(startupBudgetSeconds > 0 && startupBudgetSeconds.isFinite)
    self.startupPreflight = startupPreflight
    self.startupBudgetSeconds = startupBudgetSeconds
    self._state = state
    self.q = DispatchQueue(label: "record-screen.rec.\(id)", qos: .userInteractive)
    super.init()
    snapshot = describeLocked()
  }

  // MARK: - Scheduling

  /// Sets the arm timer. Called on creation and after a reschedule or reload.
  func schedule() {
    q.async { [self] in
      guard state == .scheduled else { return }
      armTimer?.cancel()
      let now = Date()
      if _endAt <= now {
        finish(.missed, reason: "end_at passed before the recording could start")
        return
      }
      if _startAt < now.addingTimeInterval(-2) && ifLate == "skip" {
        finish(.missed, reason: "start_at passed and if_late is skip")
        return
      }
      let armAt = _startAt.addingTimeInterval(-Self.prerollSeconds)
      armTimer = wallTimer(at: armAt) { [weak self] in self?.arm() }
    }
  }

  func reschedule(start: Date?, end: Date?) throws {
    let stillScheduled: Bool = try onQueue {
      switch self.state {
      case .scheduled:
        let newStart = start ?? self._startAt, newEnd = end ?? self._endAt
        guard newEnd > newStart,newEnd.timeIntervalSince(newStart)<=Recordings.maxDuration,
              newStart.timeIntervalSinceNow<=Recordings.maxLeadTime else { throw RPCError.badParams("invalid reschedule interval: 3 h duration and 7 day lead limits apply") }
        self.snapLock.withLock { self._startAt = newStart; self._endAt = newEnd }
      case .arming, .recording:
        guard start == nil else { throw RPCError(code: "already_started", message: "recording \(self.id) already started; only end_at can change") }
        guard let end else { return false }
        guard end > Date(),end.timeIntervalSince(self._startAt)<=Recordings.maxDuration else { throw RPCError.badParams("end_at must be in the future and within 3 h of start") }
        self.snapLock.withLock { self._endAt = end }
        self.endHostNs = self.hostNs(for: end)
        self.snapLock.withLock { self.inputEndHostSnap=self.endHostNs }
        self.endTimer?.cancel()
        self.endTimer = self.wallTimer(at: end.addingTimeInterval(0.15)) { [weak self] in self?.finalize(reason: nil) }
        self.note("end_moved", ["end_at": iso8601.string(from: end)])
      default:
        throw RPCError(code: "finished", message: "recording \(self.id) is \(self.state.rawValue)")
      }
      self.persist()
      return self.state == .scheduled
    }
    if stillScheduled { schedule() }
  }

  /// Runs `work` on `q` and waits at most `timeout`: a recording whose queue
  /// is stuck (encoder stall) answers "busy" instead of hanging the caller.
  private func onQueue<T>(timeout: Double = 2, _ work: @escaping () throws -> T) throws -> T {
    let done = DispatchSemaphore(value: 0)
    var result: Result<T, Error>?
    q.async {
      result = Result { try work() }
      done.signal()
    }
    guard done.wait(timeout: .now() + timeout) == .success, let result else {
      throw RPCError(code: "busy", message: "recording \(id) is not responding (its encoder may be stalled)")
    }
    return try result.get()
  }

  /// Restores what a saved manifest knows (after an engine restart). A
  /// recording that was mid-flight becomes `interrupted`.
  func restore(from m: [String: Any], interrupted: Bool) {
    q.async { [self] in
      events = m["events"] as? [[String: Any]] ?? []
      marks = m["marks"] as? [[String: Any]] ?? []
      review = m["review"] as? [String: Any]
      activityTimeline = m["activity_per_s"] as? [Double]
      resolved = m["resolved"] as? [String: Any]
      exclusionQuality = m["exclusion_quality"] as? [String:Any]
      error = m.str("error")
      actualStart = m.str("actual_start").flatMap(parseISO)
      actualEnd = m.str("actual_end").flatMap(parseISO)
      firstFrameDelayMs = m.num("first_frame_delay_ms")
      restoredSource = m["source_packet"] as? [String: Any]
      framesProvenance = m.str("frames_provenance") ?? "saved_manifest"
      if let f = m["frames"] as? [String: Any] {
        framesWritten = Int(f.num("written") ?? 0)
        framesDropped = Int(f.num("dropped") ?? 0)
        framesSeen = Int(f.num("seen") ?? 0)
      }
      if interrupted {
        error = "the engine stopped during this recording; partial footage may remain playable, but final coverage must be checked"
        framesProvenance = "persisted_checkpoint_not_final"
        restoredSource?["state"] = "interrupted"
        restoredSource?["complete"] = false
        restoredSource?["counts_provenance"] = "persisted_checkpoint_not_final"
        persist()
      } else {
        let d = describeLocked()
        snapLock.withLock { snapshot = d }
      }
    }
  }

  /// The newest captured frame while recording: lets a frame check of the
  /// same area read the recording's own stream instead of opening another.
  func tap() -> CVPixelBuffer? {
    snapLock.withLock { _state == .recording ? tapBuffer : nil }
  }

  /// Keyframe candidates: marks plus the scene changes seen while recording.
  private func reviewKeys() -> [Review.Key] {
    let m = marks.compactMap { d -> Review.Key? in d.num("t_s").map { Review.Key(t: $0, reason: "mark", label: d.str("label")) } }
    return m + activity.keys.map { Review.Key(t: $0.t, reason: "change", label: nil) }
  }

  /// Review for a recording that finished without one (interrupted, or from
  /// before reviews existed): marks plus evenly spaced frames.
  func reviewNow() async throws -> [String: Any] {
    if let r = snapLock.withLock({ snapshot["review"] as? [String: Any] }), r["error"] == nil { return r }
    guard FileManager.default.fileExists(atPath: videoPath) else { throw RPCError(code: "no_video", message: "recording \(id) has no video") }
    let keys: [Review.Key] = (snapLock.withLock { snapshot["marks"] as? [[String: Any]] } ?? []).compactMap { d in
      d.num("t_s").map { Review.Key(t: $0, reason: "mark", label: d.str("label")) }
    }
    let r = try await Review.make(video: videoPath, dir: dir, keys: keys)
    q.async { [self] in
      review = r
      persist()
    }
    return r
  }

  /// Marks this moment in the video. Returns the offset in seconds, or nil
  /// when the recording isn't running.
  func addMark(_ label: String, kind: String) -> Double? {
    let (st, startNs) = snapLock.withLock { (_state, startHostSnap) }
    guard st == .recording else { return nil }
    let host = uptimeNs()
    let t = (Double(Int64(host) - Int64(startNs)) / 1e9 * 1000).rounded() / 1000
    let mark: [String: Any] = ["label": label, "kind": kind, "t_s": t, "at": iso8601.string(from: Date()),
                             "host_ns": String(host), "relative_ns": host >= startNs ? String(host - startNs) : "-" + String(startNs - host)]
    q.async { [self] in
      marks.append(mark)
      sourceJournal?.offer(["kind": "semantic_mark", "mark": mark, "ownership": "caller_declared"])
      persist()
    }
    return t
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
    let lateBy = now.timeIntervalSince(_startAt)
    if lateBy > 2 {
      if ifLate == "skip" { finish(.missed, reason: "armed \(Int(lateBy)) s late and if_late is skip"); return }
      note("started_late", ["late_s": lateBy])
    }
    setState(.arming)
    // If capture hasn't started 8 s after start_at, give up (a wedged encoder
    // or ScreenCaptureKit never answering) rather than sit in arming forever.
    let deadline = max(0, _startAt.timeIntervalSinceNow) + startupBudgetSeconds
    DispatchQueue.global().asyncAfter(deadline: .now() + deadline) { [weak self] in
      guard let self else { return }
      self.abandon(if: .arming, as: .failed, reason: "capture did not start within \(self.startupBudgetSeconds) s of start_at; unfinished startup retains its admission slot", stall: false)
      self.q.async {
        guard self.state == .failed else { return }
        self.stopTimers(keepArm: false)
        self.teardownStream()
        self.writer?.cancelWriting()
        self.stopInputJournal()
        if !self.wroteFirst { try? FileManager.default.removeItem(atPath: self.videoPath) }
      }
    }
    // Map wall-clock times onto the host clock that frame timestamps use.
    startHostNs = hostNs(for: max(_startAt, now))
    endHostNs = hostNs(for: _endAt)
    snapLock.withLock { inputEndHostSnap=endHostNs }
    do {
      let journal = try SourceJournal(path: dir + "/source.jsonl", epoch: startHostNs,
                                      recordingID: id, target: targetRaw)
      snapLock.withLock { sourceJournal = journal }
      guard observeHostClock() else { return }
    } catch {
      restoredSource = ["schema": "record-screen-source/v1", "state": "unavailable", "complete": false,
                        "error": "source journal could not be created"]
    }
    holdPower()
    snapLock.withLock { startupPending = true }
    Task {
      await self.startCapture()
      self.q.async {
        self.snapLock.withLock { self.startupPending = false }
        self.persist()
      }
    }
  }

  private func startCapture() async {
    do {
      try await startupPreflight?()
      guard state == .arming else { return }
      let spec = try TargetSpec.parse(targetRaw)
      if !spec.options.excludeApps.isEmpty {
        let lease=try ExclusionApps.shared.tracker.subscribe(spec.options.excludeApps) {[weak self] change in
          self?.q.async {[weak self] in self?.exclusionChanged(change)}
        }
        do {
          try q.sync {
            guard state == .arming else{throw CancellationError()}
            exclusionLease=lease
            exclusionQuality=["state":"observing","policy":"interrupt take on observed process identity change",
                              "first_affected_frame":"unknown on change; observation can lag"]
            try lease.validate()
          }
        } catch {ExclusionApps.shared.tracker.unsubscribe(lease);throw error}
      }
      var content = try await Targets.content(fresh: true)
      guard state == .arming else { return }
      let target: ResolvedTarget
      do {
        target = try Targets.resolve(spec, content: content)
      } catch {
        content = try await Targets.content(fresh: true)
        guard state == .arming else { return }
        target = try Targets.resolve(spec, content: content)
      }
      let width = settings.maxWidth == -1 ? Int(target.frame.width) : settings.maxWidth
      let cfg = target.configuration(maxWidth: width, pixelFormat: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
                                     showsCursor: settings.showCursor)
      cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(settings.fps))
      cfg.queueDepth = 8
      try q.sync {
        guard state == .arming else { throw CancellationError() }
        var excluded:[String:Set<Int32>]=[:]
        for app in target.excludedApplications {excluded[app.bundleIdentifier,default:[]].insert(app.processID)}
        try exclusionLease?.validateResolved(excluded)
        try makeWriter(width: cfg.width, height: cfg.height)
      }
      let s = SCStream(filter: target.filter, configuration: cfg, delegate: self)
      try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: q)
      try q.sync {
        guard state == .arming else {
          writer?.cancelWriting()
          throw CancellationError()
        }
        try exclusionLease?.validate()
        resolved = target.describe()
        sourceJournal?.offer(["kind": "capture", "resolved": target.describe(), "settings": settings.dict])
        if inputSettings.enabled, let journal=sourceJournal {
          let context=InteractionScopeContext(pid:target.window?.owningApplication?.processID,
            windowID:target.window?.windowID,frame:target.frame,ambiguousKeys:inputSettings.ambiguousKeys,
            retainPointerInFrame:inputSettings.pointerInFrame)
          InputTimeline.shared.subscribe(id:id,sessionID:sessionID,context:context) { [weak self] value in
            guard let self else { return }
            var row=value
            let raw=(row["received_host_ns"] ?? row["host_ns"]) as? String
            if let ns=raw.flatMap(UInt64.init) {
              if row.str("kind")=="input_event" && ns>self.snapLock.withLock({self.inputEndHostSnap}) { return }
              row["relative_ns"]=journal.relative(ns)
            }
            journal.offer(row)
          }
        }
        areaKey = target.areaKey
        if let w = target.window {
          watchedWindow = (w.windowID, target.frame, w.owningApplication?.processID ?? 0)
          wasOnScreen = w.isOnScreen
          RecordingWindowContext.shared.subscribe(id,window:w.windowID,pid:w.owningApplication?.processID ?? 0)
        }
        for warning in target.warnings { note("warning", ["message": warning]) }
        stream = s
        // End the requested interval even if SDK start never acknowledges but
        // begins delivering frames. Do not turn an empty writer into recording.
        endTimer = wallTimer(at: _endAt.addingTimeInterval(0.15)) { [weak self] in self?.finalize(reason: nil) }
        monitorTimer = repeatingTimer(1.0) { [weak self] in self?.monitor() }
      }
      try await s.startCapture()
      let streamID = ObjectIdentifier(s)
      q.async { [self] in
        guard state == .arming || state == .recording else {
          if let current = stream, ObjectIdentifier(current) == streamID { teardownStream() }
          writer?.cancelWriting()
          if !wroteFirst { try? FileManager.default.removeItem(atPath: videoPath) }
          return
        }
        guard state == .arming else { return }
        let toStart = Double(Int64(startHostNs) - Int64(uptimeNs())) / 1e9
        startTimer = delayTimer(max(0, toStart) + 0.005) { [weak self] in self?.beginAtStart() }
        persist()
      }
    } catch {
      q.async { [self] in
        guard state == .arming || state == .recording else { return }
        let msg = (error as? RPCError)?.message ?? "\(error)"
        if state == .recording {
          finalize(reason: "capture startup acknowledgement failed: \(msg)")
          return
        }
        teardownStream()
        writer?.cancelWriting()
        try? FileManager.default.removeItem(atPath: videoPath)
        finish(.failed, reason: "could not start: \(msg)")
      }
    }
  }

  private func makeWriter(width: Int, height: Int) throws {
    try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    try? FileManager.default.removeItem(atPath: videoPath)
    let w = try AVAssetWriter(outputURL: URL(fileURLWithPath: videoPath), fileType: .mp4)
    // Edit-list offsets use the movie timescale independently of the track.
    w.movieTimeScale = 1_000_000_000
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
    // Preserve the source journal's nanosecond timeline in the video track;
    // the default writer chose 1/600 s and quantized otherwise precise PTS.
    input.mediaTimeScale = 1_000_000_000
    guard w.canAdd(input) else { throw RPCError(code: "writer", message: "cannot configure the video writer") }
    w.add(input)
    adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
    guard w.startWriting() else { throw RPCError(code: "writer", message: "cannot start writing: \(w.error?.localizedDescription ?? "")") }
    writer = w
    self.input = input
  }

  func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
    guard stream === s, type == .screen, state == .arming || state == .recording,
          let info = (CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]])?.first else { return }
    let receiptClock = HostClockSample.read()
    guard observeHostClock(receiptClock) else { return }
    let sourceID = sourceSequence; sourceSequence += 1
    let pts = SourceJournal.hostNS(sb.presentationTimeStamp)
    let pb = CMSampleBufferGetImageBuffer(sb)
    let raw = (info[.status] as? NSNumber)?.intValue
    let geometry = SourceJournal.geometry(info, pixels: pb.map { [CVPixelBufferGetWidth($0), CVPixelBufferGetHeight($0)] } ?? [])
    let identity = jsonData(geometry, options: [.sortedKeys])
    if identity != previousGeometry {
      geometrySequence += 1; previousGeometry = identity
      if watchedWindow != nil, let screen=geometry["screen_points"] as? [String:Any],let x=screen.num("x"),let y=screen.num("y"),let w=screen.num("w"),let h=screen.num("h") {
        InputTimeline.shared.updateFrame(id:id,frame:CGRect(x:x,y:y,width:w,height:h))
      }
      sourceJournal?.offer(["kind": "geometry", "segment": geometrySequence,
                            "first_source_frame": sourceID, "relative_ns": pts.map { sourceJournal?.relative($0) as Any? ?? NSNull() } as Any? ?? NSNull(),
                            "geometry": geometry])
    }
    if let pb, raw == SCFrameStatus.complete.rawValue {
      let color = CaptureColor(pb)
      if color != previousColor {
        colorSequence += 1; previousColor = color
        sourceJournal?.offer(["kind":"color", "segment":colorSequence, "first_source_frame":sourceID,
          "relative_ns":pts.map { sourceJournal?.relative($0) as Any? ?? NSNull() } as Any? ?? NSNull(),
          "color":color.dict])
      }
    }
    var row: [String: Any] = ["kind": "source_frame", "source_frame": sourceID, "geometry_segment": geometrySequence,
                             "color_segment":colorSequence >= 0 ? colorSequence as Any : NSNull(),
                             "status": raw as Any? ?? NSNull(), "received_host_ns": String(receiptClock.uptimeAfter),
                             "receipt_clock_segment":sourceJournal != nil ? receiptClockSegment as Any : NSNull(),
                             "pts": ["value": String(sb.presentationTimeStamp.value), "timescale": sb.presentationTimeStamp.timescale],
                             "pts_host_ns": pts.map(String.init) as Any? ?? NSNull(),
                             "relative_ns": pts.map { sourceJournal?.relative($0) as Any? ?? NSNull() } as Any? ?? NSNull()]
    if let ticks = info[.displayTime] as? NSNumber {
      row["display_mach_ticks"] = String(ticks.uint64Value)
      var timebase = mach_timebase_info_data_t(); mach_timebase_info(&timebase)
      if timebase.denom > 0 && ticks.uint64Value <= UInt64.max / UInt64(timebase.numer) {
        row["display_host_ns"] = String(ticks.uint64Value * UInt64(timebase.numer) / UInt64(timebase.denom))
      }
    }
    sourceJournal?.offer(row)
    guard raw == SCFrameStatus.complete.rawValue, let pb, let pts else { return }
    framesSeen += 1
    lastBuffer = pb
    lastSource = sourceID
    snapLock.withLock { tapBuffer = pb }
    if pts < startHostNs {
      prerollBuffer = pb  // the screen as it is just before start_at
      prerollSource = sourceID
      return
    }
    if pts > endHostNs { return }
    if !wroteFirst { beginAtStart() }
    append(pb, at: pts, source: sourceID)
  }

  func stream(_ s: SCStream, didStopWithError error: Error) {
    let streamID = ObjectIdentifier(s)
    q.async { [self] in
      guard let current = stream, ObjectIdentifier(current) == streamID, state == .arming || state == .recording else { return }
      let monitor=RecordingWindowContext.shared.refresh()
      let gone = watchedWindow.map { w in monitor.requestedWindows.contains(w.id) && monitor.windowStates[w.id] == nil } ?? false
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
    snapLock.withLock { startHostSnap = startHostNs }
    actualStart = Date().addingTimeInterval(-Double(Int64(uptimeNs()) - Int64(startHostNs)) / 1e9)
    setState(.recording)
    if let pre = prerollBuffer {
      append(pre, at: startHostNs, source: prerollSource, held: "preroll_at_start")
      prerollBuffer = nil
    }
  }

  private func append(_ pb: CVPixelBuffer, at ns: UInt64, source: Int? = nil, held: String? = nil) {
    guard let input, let adaptor, ns >= startHostNs, ns <= endHostNs, ns > lastWrittenNs || framesWritten == 0 else { return }
    let ready = input.isReadyForMoreMediaData
    let accepted = ready && adaptor.append(pb, withPresentationTime: cmTime(ns))
    sourceJournal?.offer(["kind": "encoded_frame", "source_frame": source as Any? ?? NSNull(),
                          "host_ns": String(ns), "relative_ns": sourceJournal?.relative(ns) as Any? ?? NSNull(),
                          "encoded_sequence": accepted ? framesWritten as Any : NSNull(), "accepted": accepted,
                          "time_basis": "writer_requested_nanoseconds",
                          "held": held as Any? ?? NSNull(), "decision": accepted ? "appended" : (ready ? "append_failed" : "encoder_backpressure")])
    if accepted {
      if framesWritten == 0 { firstFrameDelayMs = Double(Int64(uptimeNs()) - Int64(startHostNs)) / 1e6 }
      framesWritten += 1
      lastWrittenNs = ns
      activity.observe(pb, t: Double(ns - startHostNs) / 1e9)
    } else {
      framesDropped += 1
    }
  }

  // MARK: - Finishing

  private func finalize(reason: String?, checkClock: Bool = true) {
    guard state == .recording || state == .arming else { return }
    if checkClock && !observeHostClock() { return }
    let wasRecording = wroteFirst
    snapLock.withLock { encoderPending = wasRecording && writer != nil && input != nil; encoderCallsPending = writer != nil }
    snapLock.withLock { inputEndHostSnap=endHostNs }
    // Arm before persistence, held-frame writes or any encoder finishing call.
    // A blocked queue must not prevent its own watchdog from being installed.
    // The partial file requires independent decoding; coverage is unknown.
    var budget = 15.0
    #if RECORD_SCREEN_QUALIFICATION
    budget = qualificationFinalizeBudget
    #endif
    DispatchQueue.global().asyncAfter(deadline: .now() + budget) { [weak self] in self?.abandonIfStuck() }
    setState(.finalizing)
    stopTimers(keepArm: false)
    teardownStream()
    #if RECORD_SCREEN_QUALIFICATION
    qualificationBeforeEncoderFinish?()
    #endif
    guard wasRecording, let writer, let input else {
      writer?.cancelWriting()
      snapLock.withLock { encoderCallsPending = false }
      if state.terminal { persist(); return }
      try? FileManager.default.removeItem(atPath: videoPath)
      finish(.failed, reason: reason ?? "no frames arrived before end_at")
      return
    }
    // A static screen sends one frame and then nothing: repeat the last frame
    // just before the end so the file lasts the full window.
    let frameNs = UInt64(1e9 / Double(settings.fps))
    if !hostClockInterrupted, let last = lastBuffer, endHostNs > lastWrittenNs + frameNs {
      append(last, at: endHostNs - frameNs, source: lastSource, held: "held_at_end")
    }
    input.markAsFinished()
    writer.endSession(atSourceTime: cmTime(endHostNs))
    actualEnd = Date().addingTimeInterval(-Double(Int64(uptimeNs()) - Int64(endHostNs)) / 1e9)
    let duration = Double(endHostNs - startHostNs) / 1e9
    activityTimeline = activity.timeline(duration: duration)
    let keys = reviewKeys()
    writer.finishWriting { [self] in
      snapLock.withLock { writerDone = true; encoderPending = false }
      q.async { [self] in
        // A late callback releases its reservation but cannot rewrite the
        // deadline outcome, upgrade coverage or start a review after failure.
        guard state == .finalizing else {
          prerollBuffer = nil; lastBuffer = nil
          snapLock.withLock { tapBuffer = nil }
          persist()
          return
        }
        guard writer.status == .completed else {
          finish(.failed, reason: "writer failed: \(writer.error?.localizedDescription ?? "unknown")")
          return
        }
        // Review artifacts before reporting done, so the agent's first look
        // at a finished recording already has keyframes and a contact sheet.
        Task {
          let r: [String: Any]
          do { r = try await Review.make(video: self.videoPath, dir: self.dir, keys: keys) } catch { r = ["error": "\(error)"] }
          self.q.async { [self] in
            review = r
            finish(reason == nil ? .done : .interrupted, reason: reason)
          }
        }
      }
    }
    snapLock.withLock { encoderCallsPending = false }
  }

  private func finish(_ s: RecState, reason: String?) {
    if let reason { error = reason }
    stopTimers(keepArm: false)
    releasePower()
    prerollBuffer = nil
    lastBuffer = nil
    snapLock.withLock { tapBuffer = nil }
    stopInputJournal(outcome: ["recording_state":s.rawValue,
      "writer_status":writer.map { $0.status.rawValue } as Any? ?? NSNull(),
      "successful_finalization":writer?.status == .completed,
      "encoded_submissions":framesWritten,
      "muxed_coverage":"unverified; accepted writer submissions can exceed persisted packets on failure",
      "exclusion_quality":exclusionQuality as Any? ?? NSNull(),
      "error":reason as Any? ?? NSNull()])
    setState(s)
  }

  private func stopInputJournal(outcome: [String:Any]? = nil) {
    guard let journal=sourceJournal else { return }
    let close: @Sendable () -> Void = { [self] in journal.finish(outcome:outcome) { [self] in q.async { [self] in persist() } } }
    if inputSettings.enabled { InputTimeline.shared.unsubscribe(id:id,completion:close) }
    else { close() }
  }

  func annotateAction(_ value: [String:Any]) {
    guard state == .arming || state == .recording, let journal=snapLock.withLock({sourceJournal}) else { return }
    var row: [String:Any]=["kind":"action_scope","action":value]
    let raw=value.str("end_ns") ?? value.str("start_ns")
    if let ns=raw.flatMap(UInt64.init) { row["relative_ns"]=journal.relative(ns) }
    journal.offer(row)
  }

  private func abandonIfStuck() {
    abandon(if: .finalizing, as: .interrupted,
            reason: "encoder finalization deadline exceeded; partial muxed coverage is unverified; unfinished work retains admission without restarting peers", stall: true)
  }

  /// Gives up on a recording whose queue may be blocked, without touching
  /// the queue: state, snapshot and manifest are updated from outside it.
  private func abandon(if expected: RecState, as final: RecState, reason: String, stall: Bool) {
    let stuck: [String: Any]? = snapLock.withLock {
      guard _state == expected, !stall || !writerDone || encoderCallsPending else { return nil }
      _state = final
      terminalReason = reason
      var d = snapshot
      d["state"] = final.rawValue
      d["capture_quarantined"] = startupPending || encoderPending || encoderCallsPending || streamStopsPending > 0
      d["unfinished_work"] = ["startup":startupPending,"encoder_finalization":encoderPending,"encoder_calls":encoderCallsPending,"stream_stops":streamStopsPending,
                              "admission_held":startupPending || encoderPending || encoderCallsPending || streamStopsPending > 0]
      if stall { d["frames_provenance"] = "persisted_checkpoint_not_final" }
      d["error"] = reason
      snapshot = d
      return d
    }
    guard let d = stuck else { return }
    if let data = jsonData(d, options: [.prettyPrinted, .sortedKeys]) { FileManager.default.createFile(atPath: manifestPath, contents: data) }
    releasePower()
    Log.event("recording_abandoned", ["recording_id": id, "reason": reason])
    onChange?(self)
    if stall, let journal = snapLock.withLock({sourceJournal}) {
      let outcome:[String:Any] = ["recording_state":final.rawValue,"successful_finalization":false,
        "writer_status":NSNull(),"encoded_submissions":(d["frames"] as? [String:Any])?["written"] ?? NSNull(),
        "counts_provenance":"persisted_checkpoint_not_final",
        "muxed_coverage":"unverified; decode partial media before trim, alternate-source recovery or reshoot",
        "error":reason]
      let close: @Sendable () -> Void = { [self] in journal.finish(outcome:outcome) { [weak self] in self?.persistAbandonedSnapshot() } }
      if inputSettings.enabled { InputTimeline.shared.unsubscribe(id:id,completion:close) }
      else { close() }
    }
  }

  private func teardownStream() {
    if let s = stream {
      snapLock.withLock { streamStopsPending += 1 }
      Task {
        do {
          try await s.stopCapture()
          snapLock.withLock { streamStopsPending -= 1 }
        } catch {
          // A returned error does not establish resource release. Preserve
          // the reservation and evidence; do not repeatedly retry the SDK.
          snapLock.withLock { streamStopFailures += 1 }
          Log.event("stream_stop_unconfirmed",["recording_id":id,"error":"\(error)"])
        }
        q.async { [self] in persist() }
      }
    }
    stream = nil
  }

  private func stopTimers(keepArm: Bool) {
    if !keepArm { armTimer?.cancel(); armTimer = nil }
    startTimer?.cancel(); startTimer = nil
    endTimer?.cancel(); endTimer = nil
    monitorTimer?.cancel(); monitorTimer = nil
    RecordingWindowContext.shared.unsubscribe(id)
    if let lease=exclusionLease {ExclusionApps.shared.tracker.unsubscribe(lease);exclusionLease=nil}
  }

  // MARK: - Watching for disturbances

  /// Called on this recording's queue. No service restart or peer interruption.
  /// An unbounded sample is also uncertainty: stop rather than invent coverage.
  @discardableResult func observeHostClock(_ sample:HostClockSample = .read()) -> Bool {
    guard state == .arming || state == .recording, let journal=sourceJournal else { return true }
    let segment=journal.observeClock(sample)
    guard segment != receiptClockSegment else { lastReceiptClockNS=sample.uptimeAfter; return true }
    receiptClockSegment=segment
    hostClockInterrupted=true
    note("host_clock_gap",["receipt_clock_segment":segment,
      "coverage":"unknown across clock observation interval; inspect partial media or reshoot"])
    endHostNs=max(lastWrittenNs,min(endHostNs,max(startHostNs,lastReceiptClockNS ?? startHostNs)))
    let reason="host clock continuity is uncertain; affected take stopped without filling the unknown interval"
    if state == .recording { finalize(reason:reason,checkClock:false) }
    else {
      teardownStream();writer?.cancelWriting()
      try? FileManager.default.removeItem(atPath:videoPath)
      finish(.failed,reason:reason)
    }
    return false
  }

  private func exclusionChanged(_ change:ExclusionIdentityChange) {
    guard state == .arming || state == .recording else{return}
    exclusionQuality=["state":"uncertain","change":change.dict,
                      "clean_coverage":"not established; inspect partial media or reshoot"]
    note("exclusion_identity_changed",change.dict)
    if state == .recording {
      endHostNs=min(endHostNs,uptimeNs())
      finalize(reason:"excluded helper identity changed; partial footage may contain the replacement; resolve again before a new take")
    } else {
      teardownStream();writer?.cancelWriting()
      try? FileManager.default.removeItem(atPath:videoPath)
      finish(.failed,reason:"excluded helper identity changed while arming; capture setup was abandoned")
    }
  }

  /// Once a second: did the target window move, resize, hide or vanish?
  private func monitor() {
    guard state == .recording else { return }
    guard observeHostClock() else { return }
    let current = describeLocked()
    snapLock.withLock { snapshot = current }
    guard let w = watchedWindow else { return }
    let sample=RecordingWindowContext.shared.refresh()
    let gap=sample.gap ?? (RecordingWindowContext.shared.status["recording_window_context_stalled"] as? Bool==true ? "recording_window_context_query_stalled" : nil)
    if let gap {
      if !windowMonitorGapReported {note("window_monitor_gap",["reason":gap,"context_snapshot_host_ns":String(sample.hostNS),"qualification":"disturbance context unavailable; frame metadata remains separate"]);windowMonitorGapReported=true}
    } else {windowMonitorGapReported=false}
    guard gap==nil,sample.requestedWindows.contains(w.id) else {return}
    guard let live=sample.windowStates[w.id],live.pid==w.pid else {
      if !windowGone { note("window_gone", [:]); windowGone = true }
      return
    }
    if live.frame.size != w.frame.size { note("window_resized", ["frame": rectDict(live.frame)]) }
    else if live.frame.origin != w.frame.origin { note("window_moved", ["frame": rectDict(live.frame)]) }
    watchedWindow?.frame = live.frame
    let hidden = live.hidden
    if hidden != wasHidden { note(hidden ? "app_hidden" : "app_unhidden", [:]); wasHidden = hidden }
    if live.onScreen != wasOnScreen { note(live.onScreen ? "window_on_screen" : "window_off_screen", [:]); wasOnScreen = live.onScreen }
  }

  private func note(_ kind: String, _ detail: [String: Any]) {
    var e = detail
    e["kind"] = kind
    e["at"] = iso8601.string(from: Date())
    if startHostNs > 0 { e["t_s"] = (Double(Int64(uptimeNs()) - Int64(startHostNs)) / 1e9 * 1000).rounded() / 1000 }
    events.append(e)
    sourceJournal?.offer(["kind": "disturbance", "event": e, "received_host_ns": String(uptimeNs())])
    Log.event("recording_event", ["recording_id": id, "kind": kind])
    persist()
  }

  // MARK: - State and persistence

  private func setState(_ s: RecState) {
    let changed = snapLock.withLock {
      guard !_state.terminal || _state == s else { return false }
      _state = s
      return true
    }
    guard changed else { return }
    persist()
    Log.event("recording_state", ["recording_id": id, "state": s.rawValue])
    onChange?(self)
  }

  /// Snapshot for API replies and the manifest. Call on `q`.
  func describeLocked() -> [String: Any] {
    var d: [String: Any] = [
      "recording_id": id,
      "state": state.rawValue,
      "capture_quarantined": captureQuarantined,
      "unfinished_work": unfinishedWork,
      "label": label,
      "target": targetRaw,
      "settings": settings.dict,
      "input_settings": inputSettings.dict,
      "start_at": iso8601.string(from: _startAt),
      "end_at": iso8601.string(from: _endAt),
      "if_late": ifLate,
      "created_at": iso8601.string(from: createdAt),
      "dir": dir,
      "events": events,
      "marks": marks,
      "review": review ?? NSNull(),
      "activity_per_s": activityTimeline ?? NSNull(),
      "frames": ["written": framesWritten, "dropped": framesDropped, "seen": framesSeen],
      "frames_provenance": snapLock.withLock { terminalReason == nil ? framesProvenance : "persisted_checkpoint_not_final" },
      "source_packet": sourceJournal?.describe() as Any? ?? restoredSource as Any? ?? NSNull(),
    ]
    if let k = idempotencyKey { d["idempotency_key"] = k }
    if let sid = sessionID { d["session_id"] = sid }
    if let r = resolved { d["resolved"] = r }
    if let quality=exclusionQuality {d["exclusion_quality"]=quality}
    if let e = snapLock.withLock({ terminalReason ?? error }) { d["error"] = e }
    if let a = actualStart { d["actual_start"] = iso8601.string(from: a) }
    if let a = actualEnd { d["actual_end"] = iso8601.string(from: a) }
    if let f = firstFrameDelayMs { d["first_frame_delay_ms"] = (f * 10).rounded() / 10 }
    if FileManager.default.fileExists(atPath: videoPath) {
      let bytes = (try? FileManager.default.attributesOfItem(atPath: videoPath)[.size] as? Int) ?? 0
      d["video"] = ["path": videoPath, "bytes": bytes]
    }
    return d
  }

  /// Last snapshot: refreshed on every change and once a second while
  /// recording. Never waits on `q`.
  func describe() -> [String: Any] {
    var d = snapLock.withLock { snapshot }
    d["state"] = state.rawValue
    d["capture_quarantined"] = captureQuarantined
    d["unfinished_work"] = unfinishedWork
    if let journal = snapLock.withLock({ sourceJournal }) { d["source_packet"] = journal.describe() }
    return d
  }

  private func persist() {
    let d = describeLocked()
    snapLock.withLock { snapshot = d }
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    guard let data = jsonData(d, options: [.prettyPrinted, .sortedKeys]) else { return }
    let tmp = manifestPath + ".tmp"
    FileManager.default.createFile(atPath: tmp, contents: data)
    _ = try? FileManager.default.replaceItemAt(URL(fileURLWithPath: manifestPath), withItemAt: URL(fileURLWithPath: tmp))
    if !FileManager.default.fileExists(atPath: manifestPath) { try? FileManager.default.moveItem(atPath: tmp, toPath: manifestPath) }
  }

  /// Journal closure must remain observable even if the encoder blocks q.
  /// Use a unique atomic replacement, not q's shared temporary filename.
  private func persistAbandonedSnapshot() {
    guard snapLock.withLock({ terminalReason != nil && _state.terminal }) else { return }
    let d = describe()
    guard let data = jsonData(d,options:[.prettyPrinted,.sortedKeys]) else { return }
    try? data.write(to:URL(fileURLWithPath:manifestPath),options:.atomic)
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
    powerLock.withLock {
      guard powerAssertion == 0, !state.terminal else { return }
      IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleDisplaySleep as CFString, IOPMAssertionLevel(kIOPMAssertionLevelOn),
                                  "record-screen \(id)" as CFString, &powerAssertion)
    }
  }

  private func releasePower() {
    let assertion = powerLock.withLock { let value = powerAssertion; powerAssertion = 0; return value }
    if assertion != 0 { IOPMAssertionRelease(assertion) }
  }
}
