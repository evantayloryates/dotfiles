import AppKit

/// A small, non-activating controller for the service-owned cooperative gate.
/// It is excluded from recorder sources; it never captures or locks user input.
@MainActor
final class ProductionPanel: NSObject {
  static let shared=ProductionPanel()
  private var panel:NSPanel?
  private var timer:Timer?
  private var busy=false
  private var changing=false
  private var read:(@Sendable () async throws -> [String:Any])?
  private var change:(@Sendable (Bool) async throws -> Void)?
  private var preference:String?
  private let title=NSTextField(labelWithString:"Capture foundations")
  private let state=NSTextField(labelWithString:"Connecting…")
  private let detail=NSTextField(wrappingLabelWithString:"")
  private let freshness=NSTextField(labelWithString:"")
  private let pause=NSButton(title:"Request safe pause",target:nil,action:nil)
  private let resume=NSButton(title:"Resume",target:nil,action:nil)

  func configure(preference:String,read:@escaping @Sendable () async throws -> [String:Any],change:@escaping @Sendable (Bool) async throws -> Void) {
    self.preference=preference;self.read=read;self.change=change
    if FileManager.default.fileExists(atPath:preference) {show()}
  }
  func show() {
    if panel==nil {
      let size=NSSize(width:390,height:300)
      let screen=NSScreen.screens.first(where:{$0.localizedName.contains("Built-in")}) ?? NSScreen.main ?? NSScreen.screens.first
      let visible=screen?.visibleFrame ?? NSRect(x:0,y:0,width:1000,height:800)
      let p=NSPanel(contentRect:NSRect(x:visible.maxX-size.width-24,y:visible.maxY-size.height-24,width:size.width,height:size.height),styleMask:[.titled,.closable,.nonactivatingPanel],backing:.buffered,defer:false)
      p.title="Screen recording";p.isReleasedWhenClosed=false;p.level = .floating
      p.sharingType = .none;p.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary]
      let stack=NSStackView(views:[title,state,detail,freshness,NSStackView(views:[pause,resume])])
      stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=14
      stack.translatesAutoresizingMaskIntoConstraints=false
      p.contentView?.addSubview(stack)
      if let content=p.contentView {NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:content.leadingAnchor,constant:20),stack.trailingAnchor.constraint(equalTo:content.trailingAnchor,constant:-20),stack.topAnchor.constraint(equalTo:content.topAnchor,constant:20),stack.bottomAnchor.constraint(lessThanOrEqualTo:content.bottomAnchor,constant:-16)])}
      title.font = .systemFont(ofSize:13,weight:.semibold);title.textColor = .secondaryLabelColor
      state.font = .systemFont(ofSize:22,weight:.semibold)
      detail.font = .systemFont(ofSize:13);detail.maximumNumberOfLines=6
      freshness.font = .systemFont(ofSize:11);freshness.textColor = .secondaryLabelColor
      pause.target=self;pause.action=#selector(requestPause);resume.target=self;resume.action=#selector(requestResume)
      pause.bezelStyle = .rounded;resume.bezelStyle = .rounded
      p.delegate=self;panel=p
    }
    if let preference {try? Data("visible\n".utf8).write(to:URL(fileURLWithPath:preference),options:.atomic);try? FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:preference)}
    panel?.orderFrontRegardless();refresh()
    if timer==nil {timer=Timer.scheduledTimer(withTimeInterval:1,repeats:true){[weak self] _ in MainActor.assumeIsolated {self?.refresh()}}}
  }
  func hide() {panel?.orderOut(nil);timer?.invalidate();timer=nil;if let preference {try? FileManager.default.removeItem(atPath:preference)}}
  @objc private func requestPause(){set(true)}
  @objc private func requestResume(){set(false)}
  private func set(_ paused:Bool) {
    guard !changing,let change else{return};changing=true;pause.isEnabled=false;resume.isEnabled=false
    Task {do{try await change(paused)}catch{state.stringValue="Change not confirmed";detail.stringValue="\(error). Check status before retrying."}
      changing=false;refresh()}
  }
  private func refresh() {
    guard !busy,let read else{return};busy=true
    Task {
      defer{busy=false}
      do {
        let d=try await read(),phase=d.str("state") ?? "unavailable"
        let active=d["active"] as? [[String:Any]] ?? [],queued=d["queued"] as? [[String:Any]] ?? []
        let paused=d["pause_requested"] as? Bool == true
        state.stringValue=["idle":"Ready · no active recording","recording":"Recording","draining":"Pause requested · finishing","paused":"Paused","unavailable":"Service loading / unavailable"][phase] ?? phase
        let names=active.prefix(2).compactMap{$0.str("label") ?? $0.str("id")}.joined(separator:", ")
        let expired=queued.filter{($0["production_queue"] as? [String:Any])?["requires_reschedule"] as? Bool == true}.count
        detail.stringValue="\(active.count) active · \(queued.count) queued\(names.isEmpty ? "" : "\n"+names)\n"+(paused ? "New requests wait. Current work finishes safely." : "New recording requests may start.")+(expired>0 ? "\n\(expired) queued take(s) need new start times." : "")+"\nYour mouse and keyboard remain available."
        freshness.stringValue="Updated just now · service clock \(d.str("sampled_at") ?? "unknown")"
        pause.isEnabled = !paused && !changing && phase != "unavailable";resume.isEnabled=paused && !changing && phase != "unavailable"
      } catch {state.stringValue="Status unavailable";detail.stringValue="The service did not answer. Recording state is unknown. No input is blocked.";freshness.stringValue="Refresh failed · \(Date())";pause.isEnabled=false;resume.isEnabled=false}
    }
  }
}
extension ProductionPanel:NSWindowDelegate {func windowWillClose(_ notification:Notification){hide()}}
