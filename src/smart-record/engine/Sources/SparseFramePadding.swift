import Foundation

/// Keep nanosecond media timing without oversized sparse sample durations.
/// These are held copies of a known source, never newly observed pixels.
enum SparseFramePadding {
  static let intervalNS: UInt64 = 1_000_000_000
  static let maxPerAppend = 64

  /// Interior timestamps only. nil means stop/trim rather than unbounded work.
  static func timestamps(after: UInt64, before: UInt64) -> [UInt64]? {
    guard before > after else { return [] }
    let count = (before - after - 1) / intervalNS
    guard count <= UInt64(maxPerAppend) else { return nil }
    return (1...max(1, count)).compactMap { index in
      index <= count ? after + index * intervalNS : nil
    }
  }
}
