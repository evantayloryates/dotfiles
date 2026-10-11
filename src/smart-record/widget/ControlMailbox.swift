import Foundation
import Darwin

/// Sandboxed widget -> already-running companion. No app activation, socket
/// exception or general command channel. Requests describe a desired gate state.
enum ControlMailbox {
  struct Request:Codable {
    let id:UUID
    let paused:Bool
    let createdAt:Date
    let expiresAt:Date
    func valid(at now:Date)->Bool {
      createdAt.timeIntervalSince(now)<=5 && expiresAt>now &&
      expiresAt>createdAt && expiresAt.timeIntervalSince(createdAt)<=10
    }
  }
  struct Receipt:Codable {
    let id:UUID
    let completedAt:Date
    let confirmed:Bool
    let message:String
  }
  static var directory:URL? {WidgetBridge.snapshotURL?.deletingLastPathComponent().appendingPathComponent("controls",isDirectory:true)}
  static func prepare(_ directory:URL) throws {
    try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
    let info=try directory.resourceValues(forKeys:[.isDirectoryKey,.isSymbolicLinkKey])
    guard info.isDirectory==true,info.isSymbolicLink != true else{throw RecorderControl.Failure("Control folder unavailable")}
  }
  static func read<T:Decodable>(_ type:T.Type,from url:URL)->T? {
    let fd=open(url.path,O_RDONLY|O_NOFOLLOW|O_NONBLOCK)
    guard fd>=0 else{return nil};defer{close(fd)}
    var info=stat()
    guard fstat(fd,&info)==0,info.st_mode & S_IFMT == S_IFREG,info.st_size<=16384 else{return nil}
    var bytes=[UInt8](repeating:0,count:16385)
    let size=Darwin.read(fd,&bytes,bytes.count)
    guard size>0,size<=16384 else{return nil}
    return try? JSONDecoder().decode(type,from:Data(bytes.prefix(size)))
  }
  static func write<T:Encodable>(_ value:T,to url:URL) throws {
    let data=try JSONEncoder().encode(value)
    try data.write(to:url,options:.atomic)
    try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:url.path)
  }
  static func submit(paused:Bool,directory supplied:URL?=nil) async throws -> Receipt {
    guard let folder=supplied ?? directory else{throw RecorderControl.Failure("Widget companion unavailable; open Live panel")}
    try prepare(folder)
    let now=Date(),id=UUID()
    let request=Request(id:id,paused:paused,createdAt:now,expiresAt:now.addingTimeInterval(10))
    let pending=folder.appendingPathComponent(id.uuidString+".request")
    let receiptURL=folder.appendingPathComponent(id.uuidString+".receipt")
    try write(request,to:pending)
    defer{try? FileManager.default.removeItem(at:pending)}
    // The companion claims before attempting once. A timeout must never replay
    // an uncertain request; a later click is a new, explicit desired state.
    for _ in 0..<120 {
      if let receipt=read(Receipt.self,from:receiptURL),receipt.id==id {
        guard receipt.confirmed else{throw RecorderControl.Failure(receipt.message)}
        return receipt
      }
      try await Task.sleep(nanoseconds:100_000_000)
    }
    throw RecorderControl.Failure("Response not confirmed. Check Live panel before trying again.")
  }
  static func feedback()->String? {
    guard let folder=directory,let receipt=read(Receipt.self,from:folder.appendingPathComponent("latest.json")),
          !receipt.confirmed,(0...30).contains(Date().timeIntervalSince(receipt.completedAt)) else{return nil}
    return receipt.message
  }
  /// Called serially by the companion. Claimed requests are never retried,
  /// including after a helper crash. Expired requests cannot run at next launch.
  @discardableResult static func process(directory supplied:URL?=nil,
    publish:(Snapshot)throws->Void = { snapshot in if let url=WidgetBridge.snapshotURL {try write(snapshot,to:url)} },
    apply:(Bool)throws->Snapshot)->Bool {
    guard let folder=supplied ?? directory else{return false}
    do{try prepare(folder)}catch{return false}
    let fm=FileManager.default,now=Date()
    let files=(try? fm.contentsOfDirectory(at:folder,includingPropertiesForKeys:[.contentModificationDateKey])) ?? []
    for file in files {
      let date=(try? file.resourceValues(forKeys:[.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
      if now.timeIntervalSince(date)>60 {try? fm.removeItem(at:file)}
    }
    let pending=files.filter{$0.pathExtension=="request"}.sorted {
      let left=read(Request.self,from:$0)?.createdAt ?? .distantPast
      let right=read(Request.self,from:$1)?.createdAt ?? .distantPast
      return left==right ? $0.lastPathComponent<$1.lastPathComponent : left<right
    }
    var handled=false
    for file in pending.prefix(32) {
      guard let request=read(Request.self,from:file),file.deletingPathExtension().lastPathComponent==request.id.uuidString else{try? fm.removeItem(at:file);continue}
      let claimed=file.deletingPathExtension().appendingPathExtension("claimed")
      guard (try? fm.moveItem(at:file,to:claimed)) != nil else{continue}
      var confirmed=false,message="Request expired; click again when the companion is available."
      if request.valid(at:Date()) {
        do {
          let snapshot=try apply(request.paused)
          guard snapshot.paused==request.paused,!snapshot.stale,snapshot.phase != "unavailable" else{throw RecorderControl.Failure("Gate state not confirmed. Check Live panel.")}
          try publish(snapshot)
          confirmed=true;message=request.paused ? "Pause confirmed" : "Resume confirmed"
        }catch{message="Control not confirmed. Check Live panel before retrying."}
      }
      let receipt=Receipt(id:request.id,completedAt:Date(),confirmed:confirmed,message:message)
      try? write(receipt,to:folder.appendingPathComponent(request.id.uuidString+".receipt"))
      try? write(receipt,to:folder.appendingPathComponent("latest.json"))
      // Retain the claim until expiry/cleanup so a duplicate cannot replay it.
      handled=true
    }
    return handled
  }
}
