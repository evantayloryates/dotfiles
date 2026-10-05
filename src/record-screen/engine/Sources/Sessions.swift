import Foundation

/// A session bundles everything an agent made for one piece of work:
///
///   ~/.record-screen/sessions/<session_id>/
///     session.json                  manifest (title, purpose, tags, caller, counts)
///     events.jsonl                  append-only log: notes, verifies, recordings, marks
///     frames/verify-<ms>.jpg        frame checks made in this session
///     recordings/<recording_id>/    video.mp4 + recording.json
///
/// Agents lose ids. Every session records who made it (`caller`: agent session
/// id, working directory, repo, branch), and search matches on that as well as
/// on titles, notes, recording labels and marks.
final class SessionRecord {
  let id: String
  var title: String
  var purpose: String
  var tags: [String]
  var caller: [String: Any]
  let createdAt: Date
  var updatedAt: Date
  var closedAt: Date?
  var counts: [String: Int]
  var recordingIDs: [String]
  /// Notes, recording labels and mark labels, for search.
  var searchText: [String]
  var lastImage: String?

  init(id: String, title: String, purpose: String, tags: [String], caller: [String: Any], createdAt: Date = Date()) {
    self.id = id
    self.title = title
    self.purpose = purpose
    self.tags = tags
    self.caller = caller
    self.createdAt = createdAt
    self.updatedAt = createdAt
    self.counts = ["recordings": 0, "verifies": 0, "marks": 0, "notes": 0]
    self.recordingIDs = []
    self.searchText = []
  }

  var state: String { closedAt == nil ? "open" : "closed" }

  var dict: [String: Any] {
    var d: [String: Any] = [
      "session_id": id, "title": title, "purpose": purpose, "tags": tags, "caller": caller, "state": state,
      "created_at": iso8601.string(from: createdAt), "updated_at": iso8601.string(from: updatedAt),
      "counts": counts, "recording_ids": recordingIDs, "search_text": searchText,
    ]
    if let c = closedAt { d["closed_at"] = iso8601.string(from: c) }
    if let i = lastImage { d["last_image"] = i }
    return d
  }

  static func from(_ d: [String: Any]) -> SessionRecord? {
    guard let id = d.str("session_id"), let created = d.str("created_at").flatMap(parseISO) else { return nil }
    let s = SessionRecord(id: id, title: d.str("title") ?? "", purpose: d.str("purpose") ?? "", tags: d["tags"] as? [String] ?? [],
                          caller: d["caller"] as? [String: Any] ?? [:], createdAt: created)
    s.updatedAt = d.str("updated_at").flatMap(parseISO) ?? created
    s.closedAt = d.str("closed_at").flatMap(parseISO)
    s.counts = d["counts"] as? [String: Int] ?? s.counts
    s.recordingIDs = d["recording_ids"] as? [String] ?? []
    s.searchText = d["search_text"] as? [String] ?? []
    s.lastImage = d.str("last_image")
    return s
  }
}

actor Sessions {
  /// An agent's open session is reused for this long after its last activity.
  static let reuseWindow: TimeInterval = 12 * 3600

  let root: String
  private var sessions: [String: SessionRecord] = [:]

  init(root: String) {
    self.root = root
  }

  func dir(_ id: String) -> String { "\(root)/\(id)" }

  func load() {
    let fm = FileManager.default
    try? fm.createDirectory(atPath: root, withIntermediateDirectories: true)
    for name in (try? fm.contentsOfDirectory(atPath: root)) ?? [] {
      guard let data = fm.contents(atPath: "\(root)/\(name)/session.json"),
            let d = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
            let s = SessionRecord.from(d) else { continue }
      sessions[s.id] = s
    }
    Log.event("sessions_loaded", ["count": sessions.count])
  }

  // MARK: - Create, find, close

  func create(_ p: [String: Any]) throws -> [String: Any] {
    let s = SessionRecord(id: Self.newID(), title: p.str("title") ?? "untitled", purpose: p.str("purpose") ?? "",
                          tags: p["tags"] as? [String] ?? [], caller: p["caller"] as? [String: Any] ?? [:])
    sessions[s.id] = s
    try FileManager.default.createDirectory(atPath: dir(s.id) + "/frames", withIntermediateDirectories: true)
    log(s.id, "created", ["title": s.title])
    return s.dict
  }

  /// The session a request belongs to: the one named, else the caller's most
  /// recent open session, else a new one (when `create` is true).
  func ensure(_ p: [String: Any], create: Bool, defaultTitle: String) throws -> String? {
    if let id = p.str("session_id") {
      guard let s = sessions[id] else { throw RPCError(code: "not_found", message: "no session \(id); use session.search") }
      guard s.closedAt == nil else { throw RPCError(code: "session_closed", message: "session \(id) is closed; reopen it with session.reopen or start a new one") }
      return id
    }
    let caller = p["caller"] as? [String: Any] ?? [:]
    if let agent = caller.str("agent_session_id"), !agent.isEmpty {
      let cutoff = Date().addingTimeInterval(-Self.reuseWindow)
      if let s = sessions.values
        .filter({ $0.closedAt == nil && $0.caller.str("agent_session_id") == agent && $0.updatedAt > cutoff })
        .max(by: { $0.updatedAt < $1.updatedAt }) {
        return s.id
      }
    }
    guard create else { return nil }
    var cp = p
    cp["title"] = p.str("session_title") ?? defaultTitle
    return try self.create(cp)["session_id"] as? String
  }

  func close(_ id: String, reopen: Bool = false) throws -> [String: Any] {
    let s = try record(id)
    s.closedAt = reopen ? nil : Date()
    log(id, reopen ? "reopened" : "closed", [:])
    return s.dict
  }

  func update(_ p: [String: Any]) throws -> [String: Any] {
    guard let id = p.str("session_id") else { throw RPCError.badParams("session_id is required") }
    let s = try record(id)
    if let t = p.str("title") { s.title = t }
    if let pu = p.str("purpose") { s.purpose = pu }
    if let tags = p["tags"] as? [String] { s.tags = tags }
    log(id, "updated", [:])
    return s.dict
  }

  // MARK: - Events

  func note(_ id: String, _ text: String) throws -> [String: Any] {
    _ = try record(id)
    log(id, "note", ["text": text])
    return ["session_id": id, "noted": text]
  }

  func recordingAdded(_ id: String, recordingID: String, label: String) {
    guard let s = sessions[id] else { return }
    s.recordingIDs.append(recordingID)
    if !label.isEmpty { s.searchText.append(label) }
    log(id, "recording_scheduled", ["recording_id": recordingID, "label": label])
  }

  func verified(_ id: String, image: String, target: [String: Any]) {
    sessions[id]?.lastImage = image
    log(id, "verify", ["image": image, "target": target])
  }

  /// Appends to events.jsonl and keeps the manifest's counts and search text
  /// current.
  func log(_ id: String, _ kind: String, _ fields: [String: Any]) {
    guard let s = sessions[id] else { return }
    var e = fields
    e["kind"] = kind
    e["at"] = iso8601.string(from: Date())
    s.updatedAt = Date()
    switch kind {
    case "verify": s.counts["verifies", default: 0] += 1
    case "recording_scheduled": s.counts["recordings", default: 0] += 1
    case "mark":
      s.counts["marks", default: 0] += 1
      if let l = fields.str("label") { s.searchText.append(l) }
    case "note":
      s.counts["notes", default: 0] += 1
      if let t = fields.str("text") { s.searchText.append(t) }
    default: break
    }
    if s.searchText.count > 400 { s.searchText.removeFirst(s.searchText.count - 400) }
    let d = dir(id)
    try? FileManager.default.createDirectory(atPath: d, withIntermediateDirectories: true)
    if let line = try? JSONSerialization.data(withJSONObject: e, options: [.sortedKeys]) {
      let path = d + "/events.jsonl"
      if !FileManager.default.fileExists(atPath: path) { FileManager.default.createFile(atPath: path, contents: nil) }
      if let h = FileHandle(forWritingAtPath: path) {
        h.seekToEndOfFile(); h.write(line); h.write(Data([0x0A])); try? h.close()
      }
    }
    persist(s)
  }

  // MARK: - Read

  func get(_ id: String, eventLimit: Int = 30) throws -> [String: Any] {
    let s = try record(id)
    var d = s.dict
    d.removeValue(forKey: "search_text")
    d["dir"] = dir(id)
    d["recent_events"] = recentEvents(id, limit: eventLimit)
    return d
  }

  func recentEvents(_ id: String, limit: Int) -> [[String: Any]] {
    guard let text = try? String(contentsOfFile: dir(id) + "/events.jsonl", encoding: .utf8) else { return [] }
    return text.split(separator: "\n").suffix(limit).compactMap {
      (try? JSONSerialization.jsonObject(with: Data($0.utf8))) as? [String: Any]
    }
  }

  func exists(_ id: String) -> Bool { sessions[id] != nil }
  func recordingIDs(_ id: String) -> [String] { sessions[id]?.recordingIDs ?? [] }

  /// Finds sessions by text and/or who made them. Text terms must all match
  /// somewhere: title, purpose, tags, notes, recording labels, marks, the
  /// caller's directory, repo or branch. Newest activity first.
  func search(_ p: [String: Any]) -> [String: Any] {
    let terms = (p.str("query") ?? "").lowercased().split(whereSeparator: { $0.isWhitespace }).map(String.init)
    let caller = p["caller"] as? [String: Any] ?? [:]
    let mine = p.bool("mine") ?? false
    let agent = p.str("agent_session_id") ?? (mine ? caller.str("agent_session_id") : nil)
    let cwd = p.str("cwd")
    let repo = p.str("repo")?.lowercased()
    let tag = p.str("tag")?.lowercased()
    let state = p.str("state")
    let since = p.str("since").flatMap(parseISO)
    let limit = Int(p.num("limit") ?? 10)

    var hits: [(SessionRecord, [String])] = []
    for s in sessions.values {
      if let agent, s.caller.str("agent_session_id") != agent { continue }
      if let cwd, !(s.caller.str("cwd") ?? "").hasPrefix(cwd) { continue }
      if let repo, !(s.caller.str("repo") ?? "").lowercased().contains(repo) { continue }
      if let tag, !s.tags.map({ $0.lowercased() }).contains(tag) { continue }
      if let state, s.state != state { continue }
      if let since, s.updatedAt < since { continue }
      let fields: [(String, String)] = [("title", s.title), ("purpose", s.purpose), ("tags", s.tags.joined(separator: " ")),
                                        ("notes_and_labels", s.searchText.joined(separator: " ")),
                                        ("caller", [s.caller.str("cwd"), s.caller.str("repo"), s.caller.str("branch")].compactMap { $0 }.joined(separator: " "))]
      var matched: Set<String> = []
      var all = true
      for t in terms {
        let where_ = fields.filter { $0.1.lowercased().contains(t) }.map(\.0)
        if where_.isEmpty { all = false; break }
        matched.formUnion(where_)
      }
      if !all { continue }
      hits.append((s, matched.sorted()))
    }
    hits.sort { $0.0.updatedAt > $1.0.updatedAt }
    return [
      "sessions": hits.prefix(limit).map { s, matched -> [String: Any] in
        var d: [String: Any] = [
          "session_id": s.id, "title": s.title, "state": s.state, "updated_at": iso8601.string(from: s.updatedAt),
          "created_at": iso8601.string(from: s.createdAt), "counts": s.counts, "tags": s.tags,
          "cwd": s.caller.str("cwd") ?? "", "repo": s.caller.str("repo") ?? "", "branch": s.caller.str("branch") ?? "",
        ]
        if !s.purpose.isEmpty { d["purpose"] = s.purpose }
        if !matched.isEmpty { d["matched"] = matched }
        if let last = s.searchText.last { d["last_note_or_label"] = last }
        return d
      },
      "total": hits.count,
    ]
  }

  // MARK: - Helpers

  private func record(_ id: String) throws -> SessionRecord {
    guard let s = sessions[id] else { throw RPCError(code: "not_found", message: "no session \(id); use session.search") }
    return s
  }

  private func persist(_ s: SessionRecord) {
    guard let data = try? JSONSerialization.data(withJSONObject: s.dict, options: [.prettyPrinted, .sortedKeys]) else { return }
    let path = dir(s.id) + "/session.json"
    let tmp = path + ".tmp"
    FileManager.default.createFile(atPath: tmp, contents: data)
    if rename(tmp, path) != 0 { try? FileManager.default.removeItem(atPath: tmp) }
  }

  private static func newID() -> String {
    let alphabet = Array("abcdefghjkmnpqrstuvwxyz23456789")
    return "ses_" + String((0..<8).map { _ in alphabet.randomElement()! })
  }
}
