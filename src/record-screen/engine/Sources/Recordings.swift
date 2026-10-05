import Foundation

/// The queue of recordings: creates, persists, reloads after a restart, and
/// answers queries. Each recording runs itself (see Recording).
actor Recordings {
  static let maxConcurrent = 4
  static let maxDuration: TimeInterval = 3 * 3600
  static let maxLeadTime: TimeInterval = 7 * 86400

  private let root: String
  private var jobs: [String: Recording] = [:]

  init(root: String) {
    self.root = root
  }

  // MARK: - Lifecycle

  /// Picks up manifests from before a restart: scheduled ones are re-armed,
  /// ones that were mid-recording are marked interrupted (their fragmented
  /// files stay playable up to the last second written).
  func load() {
    let fm = FileManager.default
    try? fm.createDirectory(atPath: root, withIntermediateDirectories: true)
    for name in (try? fm.contentsOfDirectory(atPath: root)) ?? [] {
      let dir = root + "/" + name
      guard let data = fm.contents(atPath: dir + "/recording.json"),
            let m = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
            let id = m.str("recording_id"), let start = m.str("start_at").flatMap(parseISO), let end = m.str("end_at").flatMap(parseISO),
            let stateRaw = m.str("state"), var state = RecState(rawValue: stateRaw) else { continue }
      if [.arming, .recording, .finalizing].contains(state) { state = .interrupted }
      let rec = Recording(id: id, dir: dir, target: m["target"] as? [String: Any] ?? [:],
                          settings: RecordSettings.fromSaved(m["settings"] as? [String: Any] ?? [:]),
                          label: m.str("label") ?? "", startAt: start, endAt: end, ifLate: m.str("if_late") ?? "start",
                          idempotencyKey: m.str("idempotency_key"), createdAt: m.str("created_at").flatMap(parseISO) ?? Date(),
                          state: state)
      jobs[id] = rec
      if state == .scheduled {
        rec.schedule()
      } else {
        rec.restore(from: m, interrupted: state == .interrupted && stateRaw != "interrupted")
      }
    }
    Log.event("recordings_loaded", ["count": jobs.count, "scheduled": jobs.values.filter { $0.state == .scheduled }.count])
  }

  // MARK: - API

  func schedule(_ p: [String: Any]) throws -> [String: Any] {
    if let key = p.str("idempotency_key"), let existing = jobs.values.first(where: { $0.idempotencyKey == key }) {
      var d = existing.describe()
      d["reused"] = true
      return d
    }
    guard let target = p["target"] as? [String: Any] else { throw RPCError.badParams("target is required") }
    _ = try TargetSpec.parse(target)
    let settings = try RecordSettings.from(p)
    guard let startRaw = p["start_at"], let start = parseTime(startRaw) else {
      throw RPCError.badParams("start_at is required: an absolute ISO 8601 time (e.g. 2026-10-05T20:15:00Z) or unix seconds")
    }
    guard let endRaw = p["end_at"], let end = parseTime(endRaw) else {
      throw RPCError.badParams("end_at is required: an absolute ISO 8601 time or unix seconds")
    }
    let now = Date()
    guard end > start else { throw RPCError.badParams("end_at must be after start_at") }
    guard end > now.addingTimeInterval(0.5) else { throw RPCError.badParams("end_at is in the past (engine time \(iso8601.string(from: now)))") }
    guard start > now.addingTimeInterval(-5) else {
      throw RPCError.badParams("start_at is \(Int(now.timeIntervalSince(start))) s in the past (engine time \(iso8601.string(from: now))); use a time from now on")
    }
    guard end.timeIntervalSince(start) <= Self.maxDuration else { throw RPCError.badParams("recordings are capped at \(Int(Self.maxDuration / 3600)) h") }
    guard start.timeIntervalSince(now) <= Self.maxLeadTime else { throw RPCError.badParams("start_at is more than 7 days away") }
    let overlapping = jobs.values.filter { !$0.state.terminal && $0.startAt < end && $0.endAt > start }
    guard overlapping.count < Self.maxConcurrent else {
      throw RPCError(code: "too_many", message: "\(overlapping.count) recordings already overlap that window (max \(Self.maxConcurrent)): \(overlapping.map(\.id).joined(separator: ", "))")
    }
    let ifLate = p.str("if_late") ?? "start"
    guard ["start", "skip"].contains(ifLate) else { throw RPCError.badParams("if_late must be start or skip") }

    let id = Self.newID()
    let dir = p.str("dir") ?? "\(root)/\(id)"
    let rec = Recording(id: id, dir: dir, target: target, settings: settings, label: p.str("label") ?? "",
                        startAt: start, endAt: end, ifLate: ifLate, idempotencyKey: p.str("idempotency_key"))
    jobs[id] = rec
    rec.save()
    rec.schedule()
    Log.event("recording_scheduled", ["recording_id": id, "start_at": iso8601.string(from: start), "end_at": iso8601.string(from: end)])
    var d = rec.describe()
    d["starts_in_s"] = (start.timeIntervalSince(now) * 1000).rounded() / 1000
    return d
  }

  func get(_ id: String) throws -> Recording {
    guard let r = jobs[id] else { throw RPCError(code: "not_found", message: "no recording \(id); use record.list") }
    return r
  }

  func list(_ p: [String: Any]) -> [String: Any] {
    let wanted = p.str("state")
    let active = p.bool("active") ?? false
    let limit = Int(p.num("limit") ?? 20)
    let all = jobs.values
      .filter { wanted == nil || $0.state.rawValue == wanted }
      .filter { !active || !$0.state.terminal }
      .sorted { $0.startAt > $1.startAt }
    return ["recordings": all.prefix(limit).map { brief($0.describe()) }, "total": all.count]
  }

  /// Blocks until the recording reaches `until` (recording | done = any
  /// finished state) or the timeout passes.
  func wait(_ id: String, until: String, timeout: Double) async throws -> [String: Any] {
    let rec = try get(id)
    let deadline = Date().addingTimeInterval(timeout)
    func reached() -> Bool {
      let s = rec.state
      return until == "recording" ? (s == .recording || s.terminal) : s.terminal
    }
    while !reached() && Date() < deadline {
      try await Task.sleep(nanoseconds: 25_000_000)
    }
    var d = rec.describe()
    d["timed_out"] = !reached()
    return d
  }

  // MARK: - Helpers

  private func brief(_ d: [String: Any]) -> [String: Any] {
    var b: [String: Any] = [:]
    for k in ["recording_id", "state", "label", "start_at", "end_at", "error", "video"] { if let v = d[k] { b[k] = v } }
    b["events"] = (d["events"] as? [Any])?.count ?? 0
    return b
  }

  private static func newID() -> String {
    let alphabet = Array("abcdefghjkmnpqrstuvwxyz23456789")
    return "rec_" + String((0..<8).map { _ in alphabet.randomElement()! })
  }
}

private let isoPlain: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime]
  return f
}()

func parseISO(_ s: String) -> Date? { iso8601.date(from: s) ?? isoPlain.date(from: s) }

/// ISO 8601 (with or without fractional seconds and offset) or unix seconds.
func parseTime(_ v: Any) -> Date? {
  if let n = v as? NSNumber, !(v is Bool) { return Date(timeIntervalSince1970: n.doubleValue) }
  if let s = v as? String { return parseISO(s) }
  return nil
}
