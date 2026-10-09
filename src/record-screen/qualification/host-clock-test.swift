import Foundation

@main struct HostClockTest {
  static func main() async throws {
    var checks = 0
    func check(_ ok:Bool,_ message:String) {
      guard ok else { fputs("failed: \(message)\n",stderr); exit(1) }; checks += 1
    }
    func sample(_ uptime:UInt64,_ offset:UInt64 = 10_000_000_000,_ width:UInt64 = 10) -> HostClockSample {
      HostClockSample(uptimeBefore:uptime,continuous:uptime+offset,uptimeAfter:uptime+width)
    }
    var t = HostClockContinuity()
    check(t.observe(sample(1_000_000_000)).count == 1,"first bracket establishes an anchor")
    check(t.observe(sample(1_100_000_000)).isEmpty,"frames do not flood anchors")
    check(t.observe(sample(31_000_000_000)).first?["kind"] as? String == "clock_anchor" && t.gaps == 0,
          "30-second callback stall with both clocks advancing is not sleep evidence")
    let rows = t.observe(sample(32_000_000_000,70_000_000_000))
    check(rows.count == 2 && rows[0]["reason"] as? String == "continuous_clock_offset_changed","large divergence makes a gap and fresh anchor")
    check(rows[0]["offset_change_lower_bound_ns"] as? String == "59999999990","bracket uncertainty bounds the change")
    check(rows[0]["interpolation_allowed"] as? Bool == false && t.segment == 1,"unknown interval is not interpolated")
    check(t.observe(sample(33_000_000_000,70_000_000_000)).count == 1 && t.gaps == 1,"new baseline does not repeat the gap")
    let reverse = t.observe(sample(34_000_000_000,10_000_000_000))
    check(reverse.first?["reason"] as? String == "clock_regressed","continuous clock reversal is explicit")
    check(t.observe(sample(33_000_000_000)).first?["reason"] as? String == "clock_regressed","uptime reversal is explicit")
    var narrow = HostClockContinuity()
    _ = narrow.observe(sample(1_000_000_000))
    check(narrow.observe(sample(2_000_000_000,10_250_000_000)).count == 1 && narrow.gaps == 0,"threshold respects bracket bounds")
    check(narrow.observe(sample(3_000_000_000,10_250_000_020)).count == 2 && narrow.gaps == 1,"baseline detects cumulative offset change")
    let invalid = HostClockSample(uptimeBefore:4_000_000_000,continuous:15_000_000_000,uptimeAfter:4_002_000_000)
    check(narrow.observe(invalid).first?["reason"] as? String == "clock_sample_unbounded","oversized bracket is uncertainty")
    check(narrow.observe(invalid).isEmpty,"repeated unbounded reads do not flood gaps")
    check(narrow.observe(sample(5_000_000_000,11_000_000_000)).count == 1,"recovery establishes a fresh baseline")
    check(HostClockSample(uptimeBefore:10,continuous:20,uptimeAfter:9).offset == nil,"reversed bracket rejected")
    check(HostClockSample(uptimeBefore:10,continuous:11,uptimeAfter:12).offset == -1...1,"zero-offset bracket can straddle zero")
    check(HostClockSample(uptimeBefore:UInt64.max-2,continuous:UInt64.max-1,uptimeAfter:UInt64.max).offset == nil,"unrepresentable signed interval stays unknown")
    var huge = HostClockContinuity()
    _ = huge.observe(HostClockSample(uptimeBefore:UInt64.max-100,continuous:UInt64.max-1,uptimeAfter:UInt64.max-90))
    check(JSONSerialization.isValidJSONObject(huge.dict),"large values preserve exact string clocks")

    let root = FileManager.default.temporaryDirectory.appendingPathComponent("clock-test-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
    defer { try? FileManager.default.removeItem(at:root) }
    let journal = try SourceJournal(path:root.appendingPathComponent("source.jsonl").path,epoch:1_000_000_000,recordingID:"clock-test",target:[:])
    check(journal.observeClock(sample(1_000_000_000)) == 0,"journal returns receipt segment")
    check(journal.observeClock(sample(2_000_000_000,30_000_000_000)) == 1,"journal returns changed segment")
    journal.finish()
    for _ in 0..<1000 {
      if journal.describe()["state"] as? String == "closed" { break }
      try await Task.sleep(nanoseconds:1_000_000)
    }
    check(journal.describe()["complete"] as? Bool == true,"clock boundaries close without lost rows")
    let saved = try String(contentsOfFile:journal.path,encoding:.utf8).split(separator:"\n").map {
      try JSONSerialization.jsonObject(with:Data($0.utf8)) as! [String:Any]
    }
    check(saved.first?["clock_policy"] != nil,"header persists policy")
    check(saved.filter{$0["kind"] as? String == "clock_gap"}.count == 1,"exactly one persisted boundary")
    let footer = saved.last?["clock_continuity"] as? [String:Any]
    check(footer?["observed_gaps"] as? Int == 1,"footer preserves observed gaps independently of video outcome")
    check(journal.observeClock(sample(3_000_000_000,50_000_000_000)) == 1,"late observation cannot mutate closed provenance")

    var passive = HostClockContinuity(), valid = 0, maxBracket:UInt64 = 0
    for _ in 0..<100 {
      let s = HostClockSample.read()
      if s.offset != nil { valid += 1 }
      if s.uptimeAfter >= s.uptimeBefore { maxBracket = max(maxBracket,s.uptimeAfter-s.uptimeBefore) }
      _ = passive.observe(s)
      try await Task.sleep(nanoseconds:20_000_000)
    }
    check(valid == 100 && passive.gaps == 0,"passive live brackets are bounded with no fabricated gap")
    print("{\"passed\":\(checks),\"passive_samples\":\(valid),\"max_bracket_ns\":\(maxBracket),\"scope\":\"injected discontinuities, uncertainty, persisted journal policy and awake live samples; no actual sleep or provider calibration\"}")
  }
}
