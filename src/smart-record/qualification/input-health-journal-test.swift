import Foundation

@main struct InputHealthJournalTest {
  static func main() async throws {
    var n=0
    func check(_ value:Bool,_ label:String){guard value else{fputs("failed: \(label)\n",stderr);exit(1)};n+=1}
    func drain(_ j:SourceJournal) async {for _ in 0..<1000{if j.describe()["pending_rows"] as? Int == 0{return};try? await Task.sleep(nanoseconds:1_000_000)};exit(2)}
    let root=FileManager.default.temporaryDirectory.appendingPathComponent("input-health-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
    defer{try? FileManager.default.removeItem(at:root)}
    let journal=try SourceJournal(path:root.appendingPathComponent("source.jsonl").path,epoch:10,recordingID:"health",target:[:])
    check(journal.describe()["latest_input_listener"] is NSNull,"no observed listener is unknown")
    journal.offer(["kind":"input_gap","reason":"tap_timeout","host_ns":"11"])
    journal.offer(["kind":"input_gap","reason":"tap_timeout","host_ns":"12"])
    journal.offer(["kind":"input_gap","reason":"tap_disabled_by_user_input","host_ns":"13","tap_fault_policy":["state":"disabled_by_user_input"]])
    await drain(journal)
    check((journal.describe()["latest_input_listener"] as? [String:Any])?["state"] as? String == "disabled_by_user_input","fault replaces an older positive listener state")
    journal.offer(["kind":"input_listener","state":"listening_after_timeout","host_ns":"14"])
    await drain(journal)
    check(journal.describe()["input_gaps_observed"] as? [String:Int] == ["tap_timeout":2,"tap_disabled_by_user_input":1],"gap reasons counted independently of callbacks")
    check((journal.describe()["latest_input_listener"] as? [String:Any])?["state"] as? String == "listening_after_timeout","actual listener transition summarized")
    journal.offer(["kind":"input_gap","reason":"listen_access_revoked","host_ns":"15","tap_fault_policy":["state":"access_revoked"]]);await drain(journal)
    check((journal.describe()["latest_input_listener"] as? [String:Any])?["state"] as? String == "access_revoked","revoked notification replaces cached listening state")
    check(journal.describe()["protected_input_last_observed"] is NSNull,"unobserved protection remains unknown")
    journal.offer(["kind":"input_gap","reason":"secure_input_enabled"]);await drain(journal)
    check(journal.describe()["protected_input_last_observed"] as? Bool == true,"reported protection is explicit")
    journal.offer(["kind":"input_gap","reason":"secure_input_ended"]);await drain(journal)
    check(journal.describe()["protected_input_last_observed"] as? Bool == false,"ended protection is explicit")
    for i in 0..<40 {journal.offer(["kind":"input_gap","reason":"synthetic-\(i)"]);await drain(journal)}
    let reasons=journal.describe()["input_gaps_observed"] as! [String:Int]
    check(reasons.count == 33 && reasons.values.reduce(0,+)==46,"reason summary stays bounded without losing accepted count")
    journal.offer(["kind":"input_gap","reason":String(repeating:"x",count:129)]);await drain(journal)
    check((journal.describe()["input_gaps_observed"] as! [String:Int])["other"] == 14,"oversized reason cannot grow descriptor")
    journal.finish()
    for _ in 0..<1000{if journal.describe()["state"] as? String == "closed"{break};try? await Task.sleep(nanoseconds:1_000_000)}
    check(journal.describe()["complete"] as? Bool == true,"accepted diagnostics close without loss")
    let rows=try String(contentsOfFile:journal.path,encoding:.utf8).split(separator:"\n").map{try JSONSerialization.jsonObject(with:Data($0.utf8)) as! [String:Any]}
    check(rows.last?["input_gaps_observed"] as? [String:Int] == journal.describe()["input_gaps_observed"] as? [String:Int],"footer persists bounded summary")
    check(rows.last?["video_outcome"] is NSNull,"diagnostic closure never invents media coverage")
    check(!journal.offer(["kind":"input_gap","reason":"late"]),"closed descriptor is immutable")
    if CommandLine.arguments.count==2 {
      let trace=try String(contentsOfFile:CommandLine.arguments[1],encoding:.utf8).split(separator:"\n").map{try JSONSerialization.jsonObject(with:Data($0.utf8)) as! [String:Any]}
      for expected in ["timeout_recovery_exhausted","disabled_by_user_input"] {
        let replay=try SourceJournal(path:root.appendingPathComponent(expected+".jsonl").path,epoch:10,recordingID:expected,target:[:])
        for row in trace {
          guard ["input_gap","input_listener"].contains(row["kind"] as? String ?? "") else{continue}
          replay.offer(row);await drain(replay)
          if (row["tap_fault_policy"] as? [String:Any])?["state"] as? String == expected{break}
        }
        check((replay.describe()["latest_input_listener"] as? [String:Any])?["state"] as? String == expected,"actual saved fault notification replaces cached listening state")
        replay.finish()
        for _ in 0..<1000 {if replay.describe()["state"] as? String == "closed"{break};try? await Task.sleep(nanoseconds:1_000_000)}
        check(replay.describe()["complete"] as? Bool == true,"saved notification replay closes without loss; no UI replay")
      }
    }
    print("{\"passed\":\(n),\"scope\":\"accepted input diagnostics, bounded reason map, unknown listener, persisted footer and closure; not provider delivery or video coverage\"}")
  }
}
