import Foundation

@main struct AdmissionTest {
  static func main() async throws {
    let root=FileManager.default.temporaryDirectory.appendingPathComponent("record-admission-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at:root) }
    let sessions=Sessions(root:root.appendingPathComponent("sessions").path)
    let session=try await sessions.create(["title":"offline admission"]),sid=session.str("session_id")!
    let dir=await sessions.dir(sid),jobs=Recordings(legacyRoot:root.appendingPathComponent("legacy").path,sessions:sessions)
    var checks=0
    func check(_ value:Bool,_ name:String) { guard value else { fatalError(name) }; checks+=1 }
    let firstStart=Date().addingTimeInterval(3600),peerStart=firstStart.addingTimeInterval(3600)
    func params(_ a:Date,_ b:Date) -> [String:Any] { ["target":["type":"display"],"start_at":iso8601.string(from:a),"end_at":iso8601.string(from:b),"input":["enabled":false]] }
    let first=try await jobs.schedule(params(firstStart,firstStart.addingTimeInterval(10)),sessionID:sid,sessionDir:dir),id=first.str("recording_id")!
    let peers=try await withThrowingTaskGroup(of:[String:Any].self,returning:[[String:Any]].self) { group in
      for _ in 0..<16 { group.addTask { try await jobs.schedule(params(peerStart,peerStart.addingTimeInterval(30)),sessionID:sid,sessionDir:dir) } }
      var rows:[[String:Any]]=[]; for try await row in group { rows.append(row) }; return rows
    }
    check(peers.count==16,"16 overlapping future captures admitted without SDK work")
    do { _=try await jobs.schedule(params(peerStart,peerStart.addingTimeInterval(30)),sessionID:sid,sessionDir:dir);fatalError("17th admitted") }
    catch let error as RPCError { check(error.code=="too_many","17th schedule fails closed") }
    let originalEnd=try await jobs.get(id).endAt
    do { _=try await jobs.reschedule(id,start:nil,end:peerStart.addingTimeInterval(10));fatalError("extension bypassed capacity") }
    catch let error as RPCError { check(error.code=="too_many","extension shares overlap admission") }
    check(try await jobs.get(id).endAt==originalEnd,"rejected extension does not mutate the take")
    let safeEnd=peerStart.addingTimeInterval(-1)
    _=try await jobs.reschedule(id,start:nil,end:safeEnd)
    check(abs(try await jobs.get(id).endAt.timeIntervalSince(safeEnd))<0.001,"nonoverlapping extension allowed")
    for (a,b) in [(firstStart,firstStart.addingTimeInterval(10801)),(Date().addingTimeInterval(8*86400),Date().addingTimeInterval(8*86400+10)),(Date().addingTimeInterval(-10),firstStart)] {
      do { _=try await jobs.reschedule(id,start:a,end:b);fatalError("invalid reschedule accepted") }
      catch { checks+=1 }
    }
    for row in peers+[first] {
      let rec=try await jobs.get(row.str("recording_id")!); rec.cancel()
      _=try await jobs.wait(rec.id,until:"done",timeout:2)
    }
    check((await jobs.list(["active":true])["total"] as? Int)==0,"owned scheduled jobs canceled without capture")
    print("{\"passed\":\(checks),\"scope\":\"schedule and extension admission, lead/duration bounds and cancellation; all starts an hour away, no SDK or UI\"}")
  }
}
