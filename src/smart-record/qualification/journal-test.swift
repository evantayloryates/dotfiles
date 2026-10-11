import Foundation
import AVFoundation
import ScreenCaptureKit

final class BlockedSink: @unchecked Sendable {
  let entered = DispatchSemaphore(value: 0), release = DispatchSemaphore(value: 0)
  let lock = NSLock()
  var data = Data()
  var first = true
  func write(_ bytes: Data) {
    let block = lock.withLock { let value = first; first = false; return value }
    if block { entered.signal(); release.wait() }
    lock.withLock { data.append(bytes) }
  }
  func rows() throws -> [[String: Any]] {
    try lock.withLock { try String(decoding: data, as: UTF8.self).split(separator: "\n").map {
      try JSONSerialization.jsonObject(with: Data($0.utf8)) as! [String: Any]
    } }
  }
}

@main struct JournalTest {
  static func main() async throws {
    var checks = 0
    func check(_ ok: Bool, _ message: String) { guard ok else { fatalError(message) }; checks += 1 }
    func closed(_ journal: SourceJournal) async {
      for _ in 0..<1000 {
        if journal.describe()["state"] as? String == "closed" { return }
        try? await Task.sleep(nanoseconds: 1_000_000)
      }
      fatalError("journal drain deadline")
    }
    let sink = BlockedSink()
    let journal = try SourceJournal(path: "/test-only", epoch: 9_007_199_254_740_999, recordingID: "synthetic",
      target: [:], capacity: 2, testSink: { sink.write($0) })
    check(sink.entered.wait(timeout: .now() + 1) == .success, "writer entered")
    check(journal.offer(["kind":"frame"]), "one free bounded slot")
    for _ in 0..<100 { check(!journal.offer(["kind":"frame"]), "overflow never waits or grows queue") }
    check(journal.describe()["pending_rows"] as? Int == 2, "bounded retained rows")
    check(journal.describe()["rows_lost"] as? Int == 100, "loss explicit")
    check(journal.relative(9_007_199_254_741_000) == "1", "exact ns beyond JavaScript integer precision")
    check(journal.relative(9_007_199_254_740_998) == "-1", "pre-epoch time preserved")
    journal.finish(); journal.finish()
    check(journal.describe()["state"] as? String == "draining", "blocked I/O closure stays observable")
    check(!journal.offer(["kind":"late"]), "late callback cannot add rows")
    sink.release.signal(); await closed(journal)
    check(journal.describe()["complete"] as? Bool == false, "overflow cannot claim complete")
    let rows = try sink.rows()
    check(rows.count == 3 && rows.last?["kind"] as? String == "footer", "one footer after accepted rows")
    check(rows.last?["rows_lost"] as? Int == 100, "persisted gap summary")

    let root = FileManager.default.temporaryDirectory.appendingPathComponent("journal-test-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let file = root.appendingPathComponent("source.jsonl").path
    let healthy = try SourceJournal(path: file, epoch: 100, recordingID: "healthy", target: [:])
    healthy.offer(["kind":"encoded_frame", "relative_ns":healthy.relative(123)])
    healthy.finish(); await closed(healthy)
    check(healthy.describe()["complete"] as? Bool == true, "healthy ledger complete")
    let failedVideo = try SourceJournal(path:root.appendingPathComponent("failed-video.jsonl").path,
      epoch:100,recordingID:"failed-video",target:[:])
    failedVideo.finish(outcome:["recording_state":"failed","successful_finalization":false,"encoded_submissions":1210])
    failedVideo.finish(outcome:["recording_state":"done","successful_finalization":true])
    await closed(failedVideo)
    check(failedVideo.describe()["complete"] as? Bool == true,"journal can close completely despite video failure")
    let outcome = failedVideo.describe()["video_outcome"] as? [String:Any]
    check(outcome?["successful_finalization"] as? Bool == false,"repeat closure never upgrades failed finalization")
    let savedRows = try String(contentsOfFile:failedVideo.path,encoding:.utf8).split(separator:"\n").map {
      try JSONSerialization.jsonObject(with:Data($0.utf8)) as! [String:Any]
    }
    check((savedRows.last?["video_outcome"] as? [String:Any])?["encoded_submissions"] as? Int == 1210,"footer persists failure independently of row completeness")
    let savedInstance = savedRows.first?["clock_instance"] as? [String:String]
    let describedInstance = failedVideo.describe()["clock_instance"] as? [String:String]
    check(savedInstance == describedInstance && savedInstance?["kind"] == "recorder_process", "source clock instance retained in header and descriptor")
    check(savedInstance?["id"] == ActionTimeline.shared.instanceID && healthy.clockInstance == failedVideo.clockInstance, "paired journals share this live process clock instance")
    let mode = try FileManager.default.attributesOfItem(atPath:file)[.posixPermissions] as! NSNumber
    check(mode.intValue == 0o600, "private source file")
    let headerBytes = try Data(contentsOf: URL(fileURLWithPath:file)).split(separator:10).first!.count + 1
    let noFooter = try SourceJournal(path:"/test-only",epoch:100,recordingID:"healthy",target:[:],byteLimit:headerBytes+1,testSink:{ _ in })
    noFooter.finish(); await closed(noFooter)
    check(noFooter.describe()["rows_lost"] as? Int == 0, "header accepted before footer cap")
    check(noFooter.describe()["complete"] as? Bool == false && (noFooter.describe()["error"] as? String)?.contains("footer") == true, "missing footer cannot claim complete")
    let failed = try SourceJournal(path:"/test-only",epoch:0,recordingID:"write-failure",target:[:],testSink:{ _ in throw NSError(domain:"qualification",code:1) })
    failed.finish(); await closed(failed)
    check(failed.describe()["rows_lost"] as? Int == 1 && failed.describe()["complete"] as? Bool == false, "write failure explicit")
    do { _ = try SourceJournal(path:file, epoch:0, recordingID:"overwrite",target:[:]); fatalError("overwrote source") }
    catch { checks += 1 }
    let capped = try SourceJournal(path:"/test-only",epoch:0,recordingID:"byte-cap",target:[:],byteLimit:32,testSink:{ _ in })
    capped.finish(); await closed(capped)
    check(capped.describe()["complete"] as? Bool == false && capped.describe()["rows_lost"] as? Int == 1, "byte cap explicit")
    check(SourceJournal.hostNS(.invalid) == nil && SourceJournal.hostNS(CMTime(value:-1,timescale:1)) == nil, "invalid PTS withheld")
    check(SourceJournal.hostNS(CMTime(value:1001,timescale:30000)) == 33_366_666, "rational PTS conversion bound")
    let geometry = SourceJournal.geometry([.screenRect:CGRect(x:-217,y:-1080,width:800,height:600),
      .contentRect:CGRect(x:10,y:20,width:800,height:600),.scaleFactor:1,.contentScale:0.5],pixels:[400,300])
    check(geometry["desktop_points_to_source_pixels"] as? [Double] == [0.5,0,0,0.5,118.5,560], "negative origin transform arithmetic")
    check(geometry["bounding_points"] is NSNull, "absent bounding attachment stays unknown")
    let bounded = SourceJournal.geometry([.screenRect:CGRect(x:-217,y:-1080,width:800,height:600),
      .contentRect:CGRect(x:10,y:20,width:800,height:600),.boundingRect:CGRect(x:0,y:0,width:440,height:600),
      .scaleFactor:1,.contentScale:0.5],pixels:[400,300])
    let encodedBounds = try JSONSerialization.jsonObject(with: JSONSerialization.data(withJSONObject: bounded)) as! [String:Any]
    let surfaceBounds = encodedBounds["bounding_points"] as! [String:NSNumber]
    check(surfaceBounds["x"]?.doubleValue == 0 && surfaceBounds["y"]?.doubleValue == 0 &&
      surfaceBounds["w"]?.doubleValue == 440 && surfaceBounds["h"]?.doubleValue == 600, "frame surface bounds retained separately")
    check(bounded["desktop_points_to_source_pixels"] as? [Double] == geometry["desktop_points_to_source_pixels"] as? [Double], "surface bounds never guessed as a desktop origin")
    let unknown = SourceJournal.geometry([:],pixels:[])
    check(unknown["desktop_points_to_source_pixels"] is NSNull, "missing geometry never invented")
    print("{\"passed\":\(checks),\"scope\":\"bounded asynchronous ledger, overflow/byte-cap gaps, private publication, exact clocks and candidate transform arithmetic; no SDK capture\"}")
  }
}
