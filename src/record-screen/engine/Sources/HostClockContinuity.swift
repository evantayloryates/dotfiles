import Foundation

/// Bracketing bounds the skew between two sequential clock reads. A stalled
/// sampling thread is uncertainty, not evidence that the machine slept.
struct HostClockSample {
  let uptimeBefore: UInt64
  let continuous: UInt64
  let uptimeAfter: UInt64
  static func read() -> HostClockSample {
    let before = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
    let continuous = clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)
    return HostClockSample(uptimeBefore: before, continuous: continuous,
                           uptimeAfter: clock_gettime_nsec_np(CLOCK_UPTIME_RAW))
  }
  var dict: [String:Any] {
    ["uptime_before_ns":String(uptimeBefore), "continuous_ns":String(continuous),
     "uptime_after_ns":String(uptimeAfter)]
  }
  var offset: ClosedRange<Int64>? {
    guard uptimeAfter >= uptimeBefore,
          uptimeAfter - uptimeBefore <= HostClockContinuity.maxBracketNS,
          let before = Int64(exactly:uptimeBefore), let after = Int64(exactly:uptimeAfter),
          let current = Int64(exactly:continuous) else { return nil }
    return (current - after)...(current - before)
  }
}

/// Serialized by SourceJournal. This detects observable clock discontinuity;
/// it neither estimates physical sleep duration nor remaps source/event PTS.
struct HostClockContinuity {
  static let maxBracketNS: UInt64 = 1_000_000
  static let thresholdNS: UInt64 = 250_000_000
  private(set) var segment = 0
  private(set) var gaps = 0
  private var previous: HostClockSample?
  private var baseline: ClosedRange<Int64>?
  private var lastAnchor: UInt64?
  private var invalid = false
  static var policy: [String:Any] {
    ["version":1, "receipt_clock":"CLOCK_UPTIME_RAW", "continuous_clock":"CLOCK_MONOTONIC_RAW",
     "max_bracket_ns":String(maxBracketNS), "offset_change_threshold_ns":String(thresholdNS),
     "segment_meaning":"receipt-time observation segment; not a frame PTS calibration",
     "gap_policy":"interrupt the affected take and preserve partial footage; do not interpolate across the uncertain interval; inspect coverage or reshoot",
     "limits":"sub-threshold changes, physical sleep duration and provider clock equivalence remain unqualified"]
  }
  mutating func observe(_ sample: HostClockSample) -> [[String:Any]] {
    var rows = [[String:Any]]()
    func gap(_ reason:String, _ lowerBound:UInt64? = nil) -> [String:Any] {
      ["kind":"clock_gap", "reason":reason, "segment":segment,
       "previous_observation":previous?.dict as Any? ?? NSNull(), "observation":sample.dict,
       "offset_change_lower_bound_ns":lowerBound.map(String.init) as Any? ?? NSNull(),
       "interpolation_allowed":false, "coverage":"unknown across observation interval",
       "cause":"unknown; clock samples alone do not establish physical sleep"]
    }
    guard let offset = sample.offset else {
      if !invalid { segment += 1; gaps += 1; rows.append(gap("clock_sample_unbounded")) }
      invalid = true; baseline = nil; lastAnchor = nil
      return rows
    }
    if let previous, let baseline, !invalid {
      // Bias signed ordering into UInt64 before subtraction; extreme test
      // samples cannot overflow signed arithmetic when the intervals differ.
      func distance(_ higher:Int64,_ lower:Int64) -> UInt64 {
        (UInt64(bitPattern:higher) ^ (1 << 63)) - (UInt64(bitPattern:lower) ^ (1 << 63))
      }
      let lower = offset.lowerBound > baseline.upperBound ? distance(offset.lowerBound,baseline.upperBound) :
        (baseline.lowerBound > offset.upperBound ? distance(baseline.lowerBound,offset.upperBound) : 0)
      let backwards = sample.uptimeBefore < previous.uptimeAfter || sample.continuous < previous.continuous
      if backwards || lower > Self.thresholdNS {
        segment += 1; gaps += 1
        rows.append(gap(backwards ? "clock_regressed" : "continuous_clock_offset_changed", lower))
        self.baseline = nil; lastAnchor = nil
      }
    }
    if baseline == nil { baseline = offset }
    if lastAnchor == nil || sample.uptimeAfter >= lastAnchor! && sample.uptimeAfter - lastAnchor! >= 1_000_000_000 {
      rows.append(["kind":"clock_anchor", "segment":segment, "observation":sample.dict,
                   "offset_min_ns":String(offset.lowerBound), "offset_max_ns":String(offset.upperBound)])
      lastAnchor = sample.uptimeAfter
    }
    previous = sample; invalid = false
    return rows
  }
  var dict: [String:Any] {
    ["policy":Self.policy, "receipt_segment":segment, "observed_gaps":gaps,
     "latest_observation":previous?.dict as Any? ?? NSNull(), "sample_unbounded":invalid,
     "qualification":"accepted observation state; consult journal loss and actual media coverage"]
  }
}
