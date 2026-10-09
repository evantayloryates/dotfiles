import Foundation

/// Recorder-stamped contextual blocks. Stamps prove service observation times,
/// not native-provider interception, exclusive ownership or the claimed result.
final class ActionTimeline: @unchecked Sendable {
  static let shared = ActionTimeline()
  private let lock = NSLock()
  private let fileLock = NSLock()
  private var root: String?
  let instanceID = UUID().uuidString.lowercased()
  private var actions: [String: [String: Any]] = [:]
  private var completedOrder: [String] = []
  private var persistenceFailures=0
  var onChange: (@Sendable ([String: Any]) -> Void)?
  private let clock: @Sendable () -> UInt64
  init(root: String? = nil, clock: @escaping @Sendable () -> UInt64 = { uptimeNs() }) { self.root=root; self.clock=clock }
  func configure(root: String) { lock.withLock { self.root=root } }
  var status: [String: Any] { lock.withLock { ["active":actions.values.filter { $0.str("state")=="active" }.count,
    "persistence_failures":persistenceFailures,"max_active":64,"max_retained_completed":512,"engine_instance":instanceID,"clock_domain":"CLOCK_UPTIME_RAW"] } }

  static func text(_ d: [String: Any], _ key: String, max: Int = 256) throws -> String {
    guard let s=d.str(key), !s.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty, s.utf8.count<=max else {
      throw RPCError.badParams("\(key) is required and must fit \(max) UTF-8 bytes")
    }
    return s
  }
  static func targetResolution(_ input: [String: Any]) throws -> String {
    guard let raw=input["target_resolution"] else { return "observed" }
    guard let mode=raw as? String,["observed","declared"].contains(mode) else { throw RPCError.badParams("target_resolution must be observed or declared") }
    return mode
  }
  static func declaredTarget(_ raw: Any?) throws -> [String: Any] {
    guard let target=raw as? [String: Any],Set(target.keys)==["bundle_id"],
          let bundle=target.str("bundle_id"),!bundle.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,bundle.utf8.count<=256 else {
      throw RPCError.badParams("declared target requires only an exact bundle_id; pid/window_id cannot be claimed")
    }
    return target
  }
  func begin(_ input: [String: Any], target: [String: Any]) throws -> [String: Any] {
    guard Set(input.keys).isSubset(of:["session_id","caller","provider","action_id","intent","context","timeout_s","target","target_resolution"]) else { throw RPCError.badParams("unsupported action.begin field") }
    let resolution=try Self.targetResolution(input)
    if resolution=="declared" { _ = try Self.declaredTarget(target) }
    let session=try Self.text(input,"session_id"), caller=try Self.text(input,"caller"), provider=try Self.text(input,"provider")
    let action=try Self.text(input,"action_id"), intent=try Self.text(input,"intent",max:3000)
    guard Set(target.keys).isSubset(of:["bundle_id","pid","window_id"]),
          let bundle=target.str("bundle_id"),!bundle.isEmpty,bundle.utf8.count<=256 else { throw RPCError.badParams("action target needs a bundle_id") }
    for key in ["pid","window_id"] where target[key] != nil {
      guard let n=target[key] as? NSNumber,CFGetTypeID(n) != CFBooleanGetTypeID(),n.doubleValue.isFinite,
            n.doubleValue.rounded(.towardZero)==n.doubleValue,n.doubleValue>=1,
            n.doubleValue<=Double(key=="pid" ? Int64(Int32.max) : Int64(UInt32.max)) else { throw RPCError.badParams("invalid target.\(key)") }
    }
    let timeout: Double
    if let raw=input["timeout_s"] {
      guard let n=raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite,
            n.doubleValue>=1, n.doubleValue<=120 else { throw RPCError.badParams("timeout_s must be 1–120 seconds") }
      timeout=n.doubleValue
    } else { timeout=30 }
    var context: [String: Any] = [:]
    if let raw=input["context"] {
      guard let d=raw as? [String: Any], Set(d.keys).isSubset(of:["purpose","before_state","expected_change","verification_plan"]) else { throw RPCError.badParams("unsupported action context") }
      for key in d.keys { context[key]=try Self.text(d,key,max:1500) }
    }
    let start=clock()
    let (deadline, overflow)=start.addingReportingOverflow(UInt64(timeout*1e9))
    guard !overflow else { throw RPCError.badParams("action clock range overflow") }
    let token="act_"+UUID().uuidString.lowercased()
    let row: [String: Any] = ["schema":"record-screen-action/v1","action_token":token,"action_id":action,
      "session_id":session,"caller":caller,"provider":provider,"intent":intent,"context":context,"target":target,"target_resolution":resolution,
      "clock_domain":"CLOCK_UPTIME_RAW","start_ns":String(start),"deadline_ns":String(deadline),"end_ns":NSNull(),
      "state":"active","result":"unknown","engine_instance":instanceID,"engine_build":Build.hash,
      "engine_pid":getpid(),"clock_provenance":"recorder_service_stamped","ownership":"caller_claimed_unverified",
      "limits":["No automatic native-provider interception", "Result is caller-reported; source/delivery evidence must corroborate",
        resolution=="declared" ? "Target is declaration only: no observed PID/window, no passive input attribution, no automatic binding" : "Target identity observed at begin only"]]
    try lock.withLock {
      guard actions.values.filter({$0.str("state")=="active"}).count<64 else { throw RPCError(code:"too_many_actions",message:"64 action scopes already active") }
      guard !actions.values.contains(where:{$0.str("state")=="active" && $0.str("session_id")==session && $0.str("caller")==caller && $0.str("action_id")==action}) else {
        throw RPCError(code:"action_busy",message:"this caller/action_id already has an active scope; recover it with action.list")
      }
      actions[token]=row
    }
    do { try persist(row) } catch { _ = lock.withLock { actions.removeValue(forKey:token) }; throw error }
    onChange?(row)
    DispatchQueue.global().asyncAfter(deadline:.now()+timeout) { [weak self] in self?.expire(token,at:deadline) }
    return lock.withLock { actions[token] ?? row }
  }
  func end(_ input: [String: Any]) throws -> [String: Any] {
    guard Set(input.keys).isSubset(of:["session_id","caller","action_token","result","evidence_refs"]) else { throw RPCError.badParams("unsupported action.end field") }
    let token=try Self.text(input,"action_token"), session=try Self.text(input,"session_id"), caller=try Self.text(input,"caller")
    let result=try Self.text(input,"result")
    guard ["dispatched","delivered","verified","failed","interrupted","unknown"].contains(result) else { throw RPCError.badParams("invalid action result") }
    let refs=try references(input["evidence_refs"])
    var row=try recover(token)
    guard row.str("session_id")==session, row.str("caller")==caller else { throw RPCError(code:"action_scope_mismatch",message:"session/caller do not own this declared token") }
    if row.str("state")=="active" && row.str("engine_instance") != instanceID {
      row["state"]="interrupted"; row["result"]="interrupted"; row["end_ns"]=NSNull(); row["end_kind"]="unknown_after_engine_restart"
      try persist(row); onChange?(row); return row
    }
    if row.str("state") != "active" { try persist(row); return row }
    let now=clock(), deadline=UInt64(row.str("deadline_ns") ?? "") ?? now
    row["state"]=now<=deadline ? "closed" : "expired"
    row["end_ns"]=String(min(now,deadline)); row["end_kind"]=now<=deadline ? "service_observed_end_request" : "declared_scope_deadline"
    row["result"]=now<=deadline ? result : "interrupted"; row["evidence_refs"]=refs
    row["target_lifetime_at_end"]="not_revalidated; source/window evidence remains necessary"
    let settled: [String: Any] = lock.withLock {
      if let current=actions[token], current.str("state") != "active" { return current }
      actions[token]=row; rememberCompleted(token); return row
    }
    try persist(settled); onChange?(settled)
    return settled
  }
  /// Bound disk reads to the newest 4096 action files; caller/session checks
  /// happen before exposing context. A lost token is recoverable after restart.
  func list(sessionID: String, caller: String?) -> [String: Any] {
    var found=lock.withLock { actions }
    var inspected=0, truncated=false, errors=0
    if let root=lock.withLock({root}), let files=try? FileManager.default.contentsOfDirectory(
      at:URL(fileURLWithPath:root),includingPropertiesForKeys:[.contentModificationDateKey],options:[.skipsHiddenFiles]) {
      let candidates=files.filter { $0.lastPathComponent.hasPrefix("act_") && $0.pathExtension=="json" }
        .sorted { ((try? $0.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate) ?? .distantPast) >
          ((try? $1.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
      truncated=candidates.count>4096
      for file in candidates.prefix(4096) {
        inspected+=1
        let token=file.deletingPathExtension().lastPathComponent
        if found[token] != nil { continue }
        do { let row=try recover(token); found[token]=row } catch { errors+=1 }
      }
    }
    var rows=Array(found.values.filter { $0.str("session_id")==sessionID && (caller==nil || $0.str("caller")==caller) }
      .sorted { ($0.str("start_ns") ?? "").compare($1.str("start_ns") ?? "",options:.numeric) == .orderedDescending }.prefix(100))
    for i in rows.indices where rows[i].str("state")=="active" && rows[i].str("engine_instance") != instanceID {
      rows[i]["state"]="interrupted"; rows[i]["result"]="interrupted"; rows[i]["end_ns"]=NSNull(); rows[i]["end_kind"]="unknown_after_engine_restart"
    }
    return ["actions":rows,"disk_files_inspected":inspected,"disk_scan_truncated":truncated,"unreadable_files":errors,
      "returned_limit":100,"recovery_limit":"newest 4096 action files; explicit token lookup remains available"]
  }
  func activeIDs(sessionID: String?, pid: Int32?, windowID: UInt32?, at now: UInt64) -> [String] {
    guard let sessionID else { return [] }
    return lock.withLock { actions.values.compactMap { row in
      guard row.str("target_resolution") != "declared", row.str("session_id")==sessionID,
            let start=row.str("start_ns").flatMap(UInt64.init),
            let end=(row.str("state")=="active" ? row.str("deadline_ns") : row.str("end_ns")).flatMap(UInt64.init), now>=start,now<=end else { return nil }
      let target=row["target"] as? [String: Any] ?? [:]
      if let pid, let actionPID=target["pid"] as? NSNumber, actionPID.int64Value != Int64(pid) { return nil }
      if let windowID, let actionWindow=target["window_id"] as? NSNumber, actionWindow.int64Value != Int64(windowID) { return nil }
      return row.str("action_token")
    }.sorted() }
  }
  private func expire(_ token: String, at deadline: UInt64) {
    let row: [String: Any]? = lock.withLock {
      guard var d=actions[token],d.str("state")=="active" else { return nil }
      d["state"]="expired"; d["end_ns"]=String(deadline); d["end_kind"]="declared_scope_deadline"; d["result"]="interrupted"
      actions[token]=d; rememberCompleted(token); return d
    }
    if let row { try? persist(row); onChange?(row) }
  }
  private func rememberCompleted(_ token: String) {
    completedOrder.append(token)
    while completedOrder.count>512 { actions.removeValue(forKey:completedOrder.removeFirst()) }
  }
  private func references(_ raw: Any?) throws -> [String] {
    guard let raw else { return [] }
    guard let refs=raw as? [String],refs.count<=16,refs.allSatisfy({$0.hasPrefix("/") && $0.utf8.count<=2048 && !$0.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })}) else { throw RPCError.badParams("evidence_refs must be up to 16 absolute local paths") }
    return refs
  }
  private func filename(_ token: String) throws -> String {
    guard token.hasPrefix("act_"), UUID(uuidString:String(token.dropFirst(4))) != nil,token.count==40,
          let root=lock.withLock({root}) else { throw RPCError(code:"action_not_found",message:"unknown action token or unconfigured action store") }
    return root+"/"+token+".json"
  }
  private func persist(_ row: [String:Any]) throws {
    do { try persistValue(row) }
    catch { lock.withLock { persistenceFailures+=1 }; throw error }
  }
  private func persistValue(_ row: [String: Any]) throws {
    let file=try filename(row.str("action_token") ?? "")
    try FileManager.default.createDirectory(atPath:(file as NSString).deletingLastPathComponent,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
    try fileLock.withLock {
      let current=lock.withLock { actions[row.str("action_token") ?? ""] ?? row }
      guard let data=jsonData(current,options:[.sortedKeys]) else { throw RPCError(code:"action_store",message:"action serialization failed") }
      try data.write(to:URL(fileURLWithPath:file),options:.atomic)
      try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file)
    }
  }
  private func recover(_ token: String) throws -> [String: Any] {
    if let row=lock.withLock({actions[token]}) { return row }
    let file=try filename(token)
    guard let data=FileManager.default.contents(atPath:file),data.count<=32768,
          let row=(try? JSONSerialization.jsonObject(with:data)) as? [String: Any],row.str("action_token")==token else {
      throw RPCError(code:"action_not_found",message:"unknown action token; use action.list within the session")
    }
    return row
  }
}
