import AppKit
import Carbon
import CoreGraphics

struct InputSettings {
  var enabled = true
  var ambiguousKeys = "shortcuts"
  var pointerInFrame = true
  static let disabled = InputSettings(enabled:false)
  static func parse(_ any: Any?) throws -> InputSettings {
    guard let any else { return InputSettings() }
    guard let d = any as? [String: Any], Set(d.keys).isSubset(of:["enabled","ambiguous_keys","pointer_in_frame"]) else {
      throw RPCError.badParams("input must contain only enabled, ambiguous_keys and pointer_in_frame")
    }
    func boolean(_ name: String, _ fallback: Bool) throws -> Bool {
      guard let value = d[name] else { return fallback }
      guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { throw RPCError.badParams("input.\(name) must be a boolean") }
      return number.boolValue
    }
    let mode = d["ambiguous_keys"] as? String ?? "shortcuts"
    guard d["ambiguous_keys"] == nil || d["ambiguous_keys"] is String,
          ["none","shortcuts","all"].contains(mode) else { throw RPCError.badParams("input.ambiguous_keys must be none, shortcuts or all") }
    return try InputSettings(enabled:boolean("enabled",true),ambiguousKeys:mode,pointerInFrame:boolean("pointer_in_frame",true))
  }
  var dict: [String: Any] { ["enabled":enabled,"ambiguous_keys":ambiguousKeys,"pointer_in_frame":pointerInFrame] }
  static func saved(_ any: Any?) -> InputSettings { any == nil ? .disabled : (try? parse(any)) ?? .disabled }
}

/// One passive event source, shared by every recording. Callback work copies
/// scalars into a bounded queue; scope evaluation and writing happen elsewhere.
/// No event is synthesized, changed, filtered or sent to an app.
final class InputTimeline: @unchecked Sendable {
  static let shared = InputTimeline()
  private final class Subscriber {
    let sessionID: String?
    let callback: @Sendable ([String: Any]) -> Void
    var context: InteractionScopeContext
    var policy = InteractionScopePolicy()
    var retained = 0
    var excluded = 0
    var overflowStart = 0
    init(sessionID: String?, context: InteractionScopeContext, callback: @escaping @Sendable ([String: Any]) -> Void) {
      self.sessionID=sessionID; self.context=context; self.callback=callback
    }
  }
  private let q = DispatchQueue(label:"record-screen.input-scope",qos:.userInteractive)
  private let lock = NSLock()
  private var subscribers: [String: Subscriber] = [:] // q only
  private var foreground: Int32 = 0
  private var snapshotNS: UInt64 = 0
  private var secure = false
  private var transientSnapshot: [Int32:Set<UInt32>] = [:]
  private var pending = 0
  private var overflow = 0
  private var callbacks = 0
  private var observedTypes: [UInt32:Int] = [:]
  private var enabledSnapshot = false
  private var contextRefreshCount = 0
  private var contextRefreshTotalNS: UInt64 = 0
  private var contextRefreshMaxNS: UInt64 = 0
  private var phase = "inactive"
  private var subscriptionCount = 0
  private var reportedOverflow = 0 // q only
  private var tap: CFMachPort? // main run loop only
  private var source: CFRunLoopSource?
  private var timer: Timer?
  private var timeoutRetries = 0
  private static let capacity = 2048
  private static let types: [CGEventType] = [.mouseMoved,.leftMouseDown,.leftMouseUp,.leftMouseDragged,
    .rightMouseDown,.rightMouseUp,.rightMouseDragged,.otherMouseDown,.otherMouseUp,.otherMouseDragged,
    .scrollWheel,.keyDown,.keyUp,.flagsChanged]

  var status: [String: Any] {
    let grant = CGPreflightListenEventAccess()
    return lock.withLock { ["state":phase,"listen_access":grant,"subscribers":subscriptionCount,
      "callbacks":callbacks,"observed_type_counts":Dictionary(uniqueKeysWithValues:observedTypes.map { (String($0.key),$0.value) }),
      "tap_enabled_last_observed":enabledSnapshot,
      "context_refresh_count":contextRefreshCount,"context_refresh_max_ns":String(contextRefreshMaxNS),
      "context_refresh_average_ns":contextRefreshCount>0 ? String(contextRefreshTotalNS/UInt64(contextRefreshCount)) : "0",
      "queued":pending,"queue_overflow":overflow,"max_queued_events":Self.capacity,
      "secure_input":secure,"context_snapshot_host_ns":String(snapshotNS),
      "keyboard_coverage":"requires delivered-event canary; listen status alone is not proof",
      "ownership":"unverified; source PID, focus and action interval are clues only"] }
  }

  func subscribe(id: String, sessionID: String?, context: InteractionScopeContext,
                 callback: @escaping @Sendable ([String: Any]) -> Void) {
    q.async { [self] in
      let subscriber=Subscriber(sessionID:sessionID,context:context,callback:callback)
      subscriber.overflowStart=lock.withLock { overflow }
      subscribers[id] = subscriber
      lock.withLock { subscriptionCount=subscribers.count }
      callback(["kind":"input_scope","scope_pid":context.pid as Any? ?? NSNull(),
                "scope_window_id":context.windowID as Any? ?? NSNull(),"frame":rectDict(context.frame),
                "ambiguous_keys":context.ambiguousKeys,"pointer_in_frame":context.retainPointerInFrame,
                "ownership":"unknown","receive_clock_domain":"CLOCK_UPTIME_RAW"])
      DispatchQueue.main.async { [self] in startIfNeeded() }
    }
  }
  func updateFrame(id: String, frame: CGRect) { q.async { [self] in subscribers[id]?.context.frame=frame } }
  func unsubscribe(id: String, completion: (@Sendable () -> Void)? = nil) {
    q.async { [self] in
      if let s=subscribers.removeValue(forKey:id) { s.callback(["kind":"input_scope_end","host_ns":String(uptimeNs()),
        "retained":s.retained,"outside_scope_count":s.excluded,"queue_overflow_during_scope":lock.withLock {overflow-s.overflowStart}]) }
      lock.withLock { subscriptionCount=subscribers.count }
      if subscribers.isEmpty { DispatchQueue.main.async { [self] in if lock.withLock({subscriptionCount==0}) { stop() } } }
      completion?()
    }
  }
  private func broadcast(_ row: [String: Any]) { q.async { [self] in for s in subscribers.values { s.callback(row) } } }
  private func startIfNeeded() {
    guard tap == nil, lock.withLock({subscriptionCount>0}) else { return }
    guard CGPreflightListenEventAccess() else {
      lock.withLock { phase="access_unavailable" }
      broadcast(["kind":"input_gap","reason":"listen_access_unavailable","host_ns":String(uptimeNs())]); return
    }
    let mask = Self.types.reduce(CGEventMask(0)) { $0 | (CGEventMask(1) << $1.rawValue) }
    tap = CGEvent.tapCreate(tap:.cgAnnotatedSessionEventTap,place:.headInsertEventTap,options:.listenOnly,
      eventsOfInterest:mask,callback:{ _, type, event, info in
        guard let info else { return Unmanaged.passUnretained(event) }
        let owner=Unmanaged<InputTimeline>.fromOpaque(info).takeUnretainedValue()
        owner.receive(type,event)
        return Unmanaged.passUnretained(event)
      },userInfo:Unmanaged.passUnretained(self).toOpaque())
    guard let tap else {
      lock.withLock { phase="tap_unavailable" }
      broadcast(["kind":"input_gap","reason":"tap_creation_failed","host_ns":String(uptimeNs())]); return
    }
    source=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,tap,0)
    guard source != nil else {
      CFMachPortInvalidate(tap); self.tap=nil
      lock.withLock { phase="tap_source_unavailable" }
      broadcast(["kind":"input_gap","reason":"tap_runloop_source_failed","host_ns":String(uptimeNs())]); return
    }
    CFRunLoopAddSource(CFRunLoopGetMain(),source,.commonModes)
    CGEvent.tapEnable(tap:tap,enable:true)
    timeoutRetries=0
    lock.withLock { phase="listening"; enabledSnapshot=CGEvent.tapIsEnabled(tap:tap) }
    refreshContext()
    timer=Timer.scheduledTimer(withTimeInterval:0.2,repeats:true) { [weak self] _ in self?.refreshContext() }
    broadcast(["kind":"input_listener","state":"listening","host_ns":String(uptimeNs()),
               "limit":"event types may be masked or suppressed; qualify delivered events"])
  }
  private func stop() {
    timer?.invalidate(); timer=nil
    if let tap { CGEvent.tapEnable(tap:tap,enable:false); CFMachPortInvalidate(tap) }
    if let source { CFRunLoopRemoveSource(CFRunLoopGetMain(),source,.commonModes) }
    tap=nil; source=nil
    lock.withLock { phase="inactive"; enabledSnapshot=false }
  }
  private func refreshContext() {
    let refreshStart=uptimeNs()
    if !CGPreflightListenEventAccess() {
      stop(); lock.withLock { phase="access_revoked" }
      broadcast(["kind":"input_gap","reason":"listen_access_revoked","host_ns":String(refreshStart)]); return
    }
    let enabled=tap.map { CGEvent.tapIsEnabled(tap:$0) } ?? false
    let newlyDisabled=lock.withLock { let changed=enabledSnapshot && !enabled; enabledSnapshot=enabled; return changed }
    if newlyDisabled { broadcast(["kind":"input_gap","reason":"tap_not_enabled_at_context_check","host_ns":String(refreshStart)]) }
    let pid=NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
    let secureNow=IsSecureEventInputEnabled()
    var transient:[Int32:Set<UInt32>]=[:]
    if let windows=CGWindowListCopyWindowInfo(.optionOnScreenOnly,kCGNullWindowID) as? [[String:Any]] {
      for window in windows.prefix(2048) {
        guard let layer=(window[kCGWindowLayer as String] as? NSNumber)?.intValue,layer>0,
              let owner=(window[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value,
              let id=(window[kCGWindowNumber as String] as? NSNumber)?.uint32Value else { continue }
        transient[owner,default:[]].insert(id)
      }
    }
    let changed=lock.withLock { let c=secure != secureNow; foreground=pid; secure=secureNow; transientSnapshot=transient; snapshotNS=uptimeNs(); return c }
    let cost=uptimeNs()-refreshStart
    lock.withLock { contextRefreshCount+=1; contextRefreshTotalNS+=cost; contextRefreshMaxNS=max(contextRefreshMaxNS,cost) }
    if changed { broadcast(["kind":"input_gap","reason":secureNow ? "secure_input_enabled" : "secure_input_ended","host_ns":String(uptimeNs())]) }
  }
  private func receive(_ type: CGEventType, _ event: CGEvent) {
    let received=uptimeNs()
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      lock.withLock { phase=type == .tapDisabledByTimeout ? "disabled_timeout" : "disabled_by_user_input"; enabledSnapshot=false }
      broadcast(["kind":"input_gap","reason":type == .tapDisabledByTimeout ? "tap_timeout" : "tap_disabled_by_user_input","host_ns":String(received)])
      if type == .tapDisabledByTimeout, timeoutRetries<3, CGPreflightListenEventAccess(), let tap {
        timeoutRetries+=1; CGEvent.tapEnable(tap:tap,enable:true); lock.withLock { phase="listening_after_timeout"; enabledSnapshot=CGEvent.tapIsEnabled(tap:tap) }
      }
      return
    }
    let admitted=lock.withLock { callbacks+=1; observedTypes[type.rawValue,default:0]+=1; guard pending<Self.capacity else { overflow+=1; return false }; pending+=1; return true }
    guard admitted else { return }
    func value(_ field: CGEventField) -> Int64 { event.getIntegerValueField(field) }
    let window=value(.mouseEventWindowUnderMousePointer)
    var sample=InteractionSample(type:type.rawValue,receivedNS:received,eventNS:event.timestamp,
      destinationPID:Int32(clamping:value(.eventTargetUnixProcessID)),sourcePID:Int32(clamping:value(.eventSourceUnixProcessID)),
      sourceTag:value(.eventSourceUserData),windowUnderPointer:window>0 && window<=Int64(UInt32.max) ? UInt32(window) : 0,
      x:event.location.x,y:event.location.y,flags:event.flags.rawValue)
    let context=lock.withLock { (foreground,snapshotNS,secure) }
    sample.foregroundPID=context.0; sample.contextNS=context.1; sample.secureInput=context.2
    if sample.keyboard { sample.keyCode=value(.keyboardEventKeycode); sample.repeated=value(.keyboardEventAutorepeat) != 0 }
    else {
      sample.button=value(.mouseEventButtonNumber); sample.eventNumber=value(.mouseEventNumber)
      sample.deltaX=event.getDoubleValueField(.mouseEventDeltaX); sample.deltaY=event.getDoubleValueField(.mouseEventDeltaY)
      if type == .scrollWheel {
        sample.scrollX=event.getDoubleValueField(.scrollWheelEventPointDeltaAxis2); sample.scrollY=event.getDoubleValueField(.scrollWheelEventPointDeltaAxis1)
        sample.scrollPhase=value(.scrollWheelEventScrollPhase); sample.momentumPhase=value(.scrollWheelEventMomentumPhase)
        sample.continuous=value(.scrollWheelEventIsContinuous) != 0
      }
    }
    let copied=sample
    q.async { [self] in process(copied); lock.withLock { pending-=1 } }
  }
  private func process(_ event: InteractionSample) {
    let snapshot=lock.withLock { (overflow,transientSnapshot) }
    if snapshot.0>reportedOverflow {
      let gap:[String:Any]=["kind":"input_gap","reason":"queue_overflow","events_skipped":snapshot.0-reportedOverflow,"host_ns":String(uptimeNs())]
      for s in subscribers.values { s.callback(gap) }; reportedOverflow=snapshot.0
    }
    for s in subscribers.values {
      s.context.foregroundPID=event.foregroundPID
      s.context.transientWindows=s.context.pid.flatMap { snapshot.1[$0] } ?? []
      s.context.actionIDs=ActionTimeline.shared.activeIDs(sessionID:s.sessionID,pid:s.context.pid,windowID:s.context.windowID,at:event.receivedNS)
      let decision=s.policy.evaluate(event,s.context)
      guard decision.retain else { s.excluded+=1; continue }
      s.retained+=1
      var row: [String: Any] = ["kind":"input_event","type":event.type,"received_host_ns":String(event.receivedNS),
        "event_timestamp_ns":String(event.eventNS),"event_clock_qualification":"raw CG timestamp; normalized timeline uses recorder receipt time",
        "source_pid":event.sourcePID,"source_tag":String(event.sourceTag),"destination_pid":event.destinationPID,
        "window_under_pointer":event.windowUnderPointer,"flags":String(event.flags),"relevance_reasons":decision.reasons,
        "scope_certainty":decision.certainty,"action_ids":decision.actionIDs,"ownership":"unknown",
        "context_snapshot_host_ns":String(event.contextNS),"foreground_pid":event.foregroundPID,
        "secure_input_snapshot":event.secureInput,"input_queue_overflow_total":snapshot.0]
      if event.keyboard { row["key_code"]=event.keyCode; row["autorepeat"]=event.repeated }
      else {
        row["raw_position"]=["x":event.x,"y":event.y]; row["position_for_composition"]=NSNull()
        row["position_qualification"]="provider-specific coordinates not promoted until qualified"
        row["button"]=event.button; row["event_number"]=event.eventNumber; row["delta"]=[event.deltaX,event.deltaY]
        if event.type == CGEventType.scrollWheel.rawValue { row["scroll"]=["x":event.scrollX,"y":event.scrollY,"phase":event.scrollPhase,"momentum_phase":event.momentumPhase,"continuous":event.continuous] }
      }
      s.callback(row)
    }
  }
}
