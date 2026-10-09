import Foundation

/// A preview filter is immutable. Once its app identities change it can never
/// serve another image, even if the same PID returns. SDK stop is separate from
/// invalidation: callers fail immediately while retirement retains admission.
final class PreviewExclusion: @unchecked Sendable {
  private let tracker: ExclusionIdentityTracker
  let lease: ExclusionIdentityLease
  private let lock = NSLock()
  private var released = false

  init(tracker: ExclusionIdentityTracker, bundles: [String], resolved: [String:Set<Int32>],
       onChange: @escaping @Sendable (ExclusionIdentityChange) -> Void) throws {
    self.tracker = tracker
    lease = try tracker.subscribe(bundles, onChange: onChange)
    do { try lease.validateResolved(resolved) }
    catch { tracker.unsubscribe(lease); throw error }
  }

  func validate() throws {
    guard !lock.withLock({ released }) else {
      throw RPCError(code: "capture_interrupted", message: "preview exclusion lease was retired")
    }
    try lease.validate()
  }

  func release() {
    let remove = lock.withLock { if released { return false }; released = true; return true }
    if remove { tracker.unsubscribe(lease) }
  }
  deinit { release() }
}
