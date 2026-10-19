import Foundation
import Darwin

enum WidgetBridge {
  static let group = "H77CX8PYPV.com.taylor.smart-record.widget"
  static let kind = "SmartRecordProduction"
  static var snapshotURL: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("production.json")
  }
  static func read() -> Snapshot {
    guard let url=snapshotURL,let data=try? Data(contentsOf:url),data.count<16384,
          let value=try? JSONDecoder().decode(Snapshot.self,from:data) else{return .unavailable}
    return value
  }
}

struct Snapshot: Codable, Equatable {
  let sampledAt:Date
  let phase:String
  let active:Int
  let queued:Int
  let actions:Int
  let paused:Bool
  static var unavailable:Self {Self(sampledAt:Date(timeIntervalSince1970:0),phase:"unavailable",active:0,queued:0,actions:0,paused:true)}
  var stale:Bool {Date().timeIntervalSince(sampledAt)>30 || sampledAt.timeIntervalSinceNow>5}
  var title:String {
    ["idle":"Ready","recording":"Recording","paused":"Paused","draining":"Pause requested · finishing"][phase] ?? "Status unavailable"
  }
}

/// The unsandboxed companion alone talks to the existing private recorder socket.
/// Only these three fixed gate/panel operations are accepted; URLs carry no commands.
enum RecorderControl {
  static func method(for url:URL)->String? {
    guard url.scheme=="smart-record-control",url.path.isEmpty,url.query==nil,url.fragment==nil,url.user==nil,url.password==nil,url.port==nil,
          let action=url.host,["pause","resume","panel"].contains(action) else{return nil}
    return action=="panel" ? "production.panel.show" : "production."+action
  }
  static func call(_ method:String) throws -> [String:Any] {
    guard ["production.status","production.pause","production.resume","production.panel.show"].contains(method) else{throw Failure("Unsupported operation")}
    let fd=socket(AF_UNIX,SOCK_STREAM,0)
    guard fd>=0 else{throw Failure("Socket unavailable")};defer{close(fd)}
    var tv=timeval(tv_sec:2,tv_usec:0)
    setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&tv,socklen_t(MemoryLayout.size(ofValue:tv)))
    setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&tv,socklen_t(MemoryLayout.size(ofValue:tv)))
    var noSig:Int32=1;setsockopt(fd,SOL_SOCKET,SO_NOSIGPIPE,&noSig,socklen_t(MemoryLayout.size(ofValue:noSig)))
    var address=sockaddr_un();address.sun_family=sa_family_t(AF_UNIX)
    let path=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".smart-record/run/engine.sock").path
    guard path.utf8.count<MemoryLayout.size(ofValue:address.sun_path) else{throw Failure("Socket path too long")}
    withUnsafeMutablePointer(to:&address.sun_path){p in p.withMemoryRebound(to:CChar.self,capacity:104){dest in path.withCString{source in _ = strcpy(dest,source)}}}
    let addressSize=socklen_t(MemoryLayout.size(ofValue:address))
    let connected=withUnsafePointer(to:&address){$0.withMemoryRebound(to:sockaddr.self,capacity:1){connect(fd,$0,addressSize)}}
    guard connected==0 else{throw Failure("Recorder did not answer")}
    var request=try JSONSerialization.data(withJSONObject:["id":1,"method":method,"params":[:]])
    request.append(10)
    var sent=0
    while sent<request.count {
      let count=request.withUnsafeBytes{send(fd,$0.baseAddress!.advanced(by:sent),request.count-sent,0)}
      guard count>0 else{throw Failure("Request not confirmed; inspect the live panel before retrying")};sent+=count
    }
    var bytes=Data(),chunk=[UInt8](repeating:0,count:4096)
    while !bytes.contains(10) && bytes.count<65536 {
      let count=recv(fd,&chunk,chunk.count,0)
      guard count>0 else{throw Failure("Response unavailable; inspect state before retrying")};bytes.append(contentsOf:chunk.prefix(count))
    }
    guard let end=bytes.firstIndex(of:10),let row=try JSONSerialization.jsonObject(with:bytes[..<end]) as? [String:Any],let result=row["result"] as? [String:Any] else{throw Failure("Recorder response unavailable")}
    return result
  }
  static func sample() throws -> Snapshot {
    let d=try call("production.status")
    guard let phase=d["state"] as? String,let paused=d["pause_requested"] as? Bool,
          let active=d["active"] as? [[String:Any]],let queued=d["queued"] as? [[String:Any]],let actions=d["active_action_scopes"] as? Int else{throw Failure("Incomplete recorder state")}
    return Snapshot(sampledAt:Date(),phase:phase,active:active.count,queued:queued.count,actions:actions,paused:paused)
  }
  struct Failure:Error,CustomStringConvertible {let description:String;init(_ text:String){description=text}}
}
