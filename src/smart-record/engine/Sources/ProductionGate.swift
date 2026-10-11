import Foundation

/// Durable cooperative pause. All capture-start admissions linearize here,
/// across every client. Already admitted producers drain; human input is never
/// blocked. Generation checks fence timers that were armed before a pause.
final class ProductionGate: @unchecked Sendable {
  private let lock=NSLock()
  private let path:String?
  private var paused=false
  private var generation:UInt64=0
  private var updatedAt=iso8601.string(from:Date())
  private var loadError:String?
  private var admitted=Set<String>()
  var onRelease:(@Sendable ()->Void)?

  init(path:String?=nil) {
    self.path=path
    guard let path,FileManager.default.fileExists(atPath:path) else{return}
    do {
      let data=try Data(contentsOf:URL(fileURLWithPath:path))
      guard data.count<=16384,let d=try JSONSerialization.jsonObject(with:data) as? [String:Any],
            d.str("schema")=="smart-record-production-gate/v1",
            let value=d["pause_requested"] as? Bool,
            let epoch=d["generation"] as? NSNumber,CFGetTypeID(epoch) != CFBooleanGetTypeID(),
            epoch.doubleValue>=0,epoch.doubleValue<Double(UInt64.max),epoch.doubleValue.rounded()==epoch.doubleValue else {
        throw RPCError.badParams("invalid persisted production gate")
      }
      paused=value;generation=epoch.uint64Value;updatedAt=d.str("updated_at") ?? updatedAt
    } catch {paused=true;loadError="Persisted pause state could not be read; explicit Resume is required."}
  }

  var snapshot:(paused:Bool,generation:UInt64) {lock.withLock{(paused,generation)}}
  var status:[String:Any] {lock.withLock{
    ["schema":"smart-record-production-gate/v1","pause_requested":paused,"generation":generation,
     "updated_at":updatedAt,"admitted_captures":admitted.sorted(),"input_locked":false,
     "load_error":loadError as Any? ?? NSNull()]
  }}
  func setPaused(_ value:Bool) throws {
    try lock.withLock {
      let next=generation+1,now=iso8601.string(from:Date())
      if let path {
        let d:[String:Any]=["schema":"smart-record-production-gate/v1","pause_requested":value,"generation":next,"updated_at":now]
        guard let data=jsonData(d) else{throw RPCError.badParams("cannot encode production gate")}
        try FileManager.default.createDirectory(atPath:(path as NSString).deletingLastPathComponent,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        try data.write(to:URL(fileURLWithPath:path),options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:path)
      }
      paused=value;generation=next;updatedAt=now;loadError=nil
    }
  }
  func admit(_ id:String,generation expected:UInt64)->Bool {lock.withLock{
    guard !paused,expected==generation,admitted.count<Recordings.maxConcurrent else{return false}
    admitted.insert(id);return true
  }}
  func release(_ id:String) {
    let changed=lock.withLock {admitted.remove(id) != nil}
    if changed {onRelease?()}
  }
  func requireOpen() throws {
    guard !snapshot.paused else{throw RPCError(code:"production_paused",message:"Global pause requested. Finish current work at a safe checkpoint; no new production action or capture was started.")}
  }
}
