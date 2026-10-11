import AppIntents

struct SetRecordingGateIntent:AppIntent {
  static var title:LocalizedStringResource = "Set screen recording pause"
  static var description:IntentDescription = "Pause new recording work safely, or resume queued work."
  static var openAppWhenRun:Bool = false
  static var isDiscoverable:Bool = false
  @Parameter(title:"Paused") var paused:Bool
  init() {paused=true}
  init(paused:Bool) {self.paused=paused}
  func perform() async throws -> some IntentResult {
    _ = try await ControlMailbox.submit(paused:paused)
    // The actual service state has been saved before WidgetKit's automatic
    // post-action reload. Never report an optimistic local toggle as a success.
    return .result()
  }
}
