import Foundation

/// Sign with the widget's existing sandbox/app-group entitlements. Calls the
/// same intent from a sandboxed process; does not certify WidgetKit dispatch.
@main struct WidgetIntentProbe {
  static func main() async {
    do {
      // Idempotent Pause preserves Taylor's paused gate during qualification.
      _ = try await SetRecordingGateIntent(paused:true).perform()
      let snapshot=WidgetBridge.read()
      guard snapshot.paused,!snapshot.stale,snapshot.phase=="paused" else{
        throw RecorderControl.Failure("Actual paused state not confirmed")
      }
      print("{\"sandboxed_intent\":\"confirmed\",\"paused\":true,\"snapshot_fresh\":true}")
    } catch {fputs("Sandboxed widget intent: \(error)\n",stderr);exit(1)}
  }
}
