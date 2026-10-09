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
  private let windows:WindowContextSampler
  private var listenerContext:ListenerContextSampler!
  private var contextTap:CFMachPort? // lock; worker retains its own reference
  private var listenAccessSnapshot:Bool? = nil
  private var listenAccessObservedNS:UInt64=0
  private var appliedContextHostNS:UInt64=0 // main only
  private var subscribers: [String: Subscriber] = [:] // q only
  private var foreground: Int32 = 0
  private var snapshotNS: UInt64 = 0
  private var secure = false
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
  private var pendingOverflow:InputQueueLoss? // lock; emitted with next admission/end
#if RECORD_SCREEN_QUALIFICATION
  private var qualificationNoTap=false
#endif
  private var tap: CFMachPort? // main run loop only
  private var source: CFRunLoopSource?
  private var timer: Timer?
  private var faults = TapFaultPolicy() // lock; transitions on main run loop
  private var faultOmittedCallbacks = 0
  private static let capacity = 2048
  private static let types: [CGEventType] = [.mouseMoved,.leftMouseDown,.leftMouseUp,.leftMouseDragged,
    .rightMouseDown,.rightMouseUp,.rightMouseDragged,.otherMouseDown,.otherMouseUp,.otherMouseDragged,
    .scrollWheel,.keyDown,.keyUp,.flagsChanged]

  init() {
    windows=WindowContextSampler(query:{
      guard let rows=CGWindowListCopyWindowInfo(.optionOnScreenOnly,kCGNullWindowID) as? [[String:Any]] else {
        return WindowContextResult(gap:"window_context_unavailable")
      }
      var transient:[Int32:Set<UInt32>]=[:]
      for window in rows.prefix(2048) {
        guard let layer=(window[kCGWindowLayer as String] as? NSNumber)?.intValue,layer>0,
              let owner=(window[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value,
              let id=(window[kCGWindowNumber as String] as? NSNumber)?.uint32Value else { continue }
        transient[owner,default:[]].insert(id)
      }
      return WindowContextResult(transientWindows:transient,gap:rows.count>2048 ? "window_context_truncated" : nil)
    })
    windows.onGap={ [weak self] reason,host in self?.broadcast(["kind":"input_gap","reason":reason,"host_ns":String(host)]) }
    listenerContext=ListenerContextSampler(query:{[weak self] in
      let heldTap:CFMachPort?=self?.lock.withLock{self?.contextTap}
      return ListenerContextResult(listenAccess:CGPreflightListenEventAccess(),
        foregroundPID:NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0,
        secureInput:IsSecureEventInputEnabled(),tapEnabled:heldTap.map{CGEvent.tapIsEnabled(tap:$0)} ?? false)
    })
  }

  var status: [String: Any] {
    var result:[String:Any]=lock.withLock { ["state":phase,"listen_access":listenAccessSnapshot.map{$0 as Any} ?? NSNull(),
      "listen_access_qualification":"last observed; unknown before first startup; background sample uses conservative query-begin time",
      "listen_access_observed_host_ns":String(listenAccessObservedNS),
      "subscribers":subscriptionCount,
      "callbacks":callbacks,"observed_type_counts":Dictionary(uniqueKeysWithValues:observedTypes.map { (String($0.key),$0.value) }),
      "tap_enabled_last_observed":enabledSnapshot,
      "tap_fault_policy":faults.dict,"callbacks_omitted_while_faulted":faultOmittedCallbacks,
      "context_refresh_count":contextRefreshCount,"context_refresh_max_ns":String(contextRefreshMaxNS),
      "context_refresh_average_ns":contextRefreshCount>0 ? String(contextRefreshTotalNS/UInt64(contextRefreshCount)) : "0",
      "queued":pending,"queue_overflow":overflow,"max_queued_events":Self.capacity,
      "secure_input":secure,"context_snapshot_host_ns":String(snapshotNS),
      "keyboard_coverage":"requires delivered-event canary; listen status alone is not proof",
      "ownership":"unverified; source PID, focus and action interval are clues only"] }
    result.merge(windows.status) { _,new in new }
    result.merge(listenerContext.status) { _,new in new }
    return result
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
                "listener_health":lock.withLock {faults.dict},
                "ownership":"unknown","receive_clock_domain":"CLOCK_UPTIME_RAW"])
      DispatchQueue.main.async { [self] in startIfNeeded() }
    }
  }
  func updateFrame(id: String, frame: CGRect) { q.async { [self] in subscribers[id]?.context.frame=frame } }
  func unsubscribe(id: String, completion: (@Sendable () -> Void)? = nil) {
    q.async { [self] in
      if let loss=lock.withLock({ () -> InputQueueLoss? in let value=pendingOverflow;pendingOverflow=nil;return value }) { emitLoss(loss) }
      if let s=subscribers.removeValue(forKey:id) { s.callback(["kind":"input_scope_end","host_ns":String(uptimeNs()),
        "retained":s.retained,"outside_scope_count":s.excluded,"queue_overflow_during_scope":lock.withLock {overflow-s.overflowStart}]) }
      lock.withLock { subscriptionCount=subscribers.count }
      if subscribers.isEmpty { DispatchQueue.main.async { [self] in if lock.withLock({subscriptionCount==0}) { stop() } } }
      completion?()
    }
  }
  private func broadcast(_ row: [String: Any]) { q.async { [self] in for s in subscribers.values {
    if row["kind"] as? String == "input_gap" { s.policy.invalidateContinuity() }
    s.callback(row)
  } } }
  private func startIfNeeded() {
#if RECORD_SCREEN_QUALIFICATION
    if qualificationNoTap { return }
#endif
    guard tap == nil, lock.withLock({subscriptionCount>0}) else { return }
    guard !lock.withLock({faults.blocksRestart}) else { return }
    let access=CGPreflightListenEventAccess()
    lock.withLock{listenAccessSnapshot=access;listenAccessObservedNS=uptimeNs()}
    guard access else {
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
    lock.withLock{contextTap=tap}
    CFRunLoopAddSource(CFRunLoopGetMain(),source,.commonModes)
    lock.withLock { faults.activate() }
    CGEvent.tapEnable(tap:tap,enable:true)
    lock.withLock { phase="listening"; enabledSnapshot=CGEvent.tapIsEnabled(tap:tap) }
    windows.activate()
    listenerContext.onGap={ [weak self] reason,host in self?.broadcast(["kind":"input_gap","reason":reason,"host_ns":String(host)]) }
    listenerContext.activate()
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
    windows.deactivate()
    listenerContext.deactivate()
    appliedContextHostNS=0
    lock.withLock { phase="inactive"; enabledSnapshot=false;contextTap=nil;foreground=0;snapshotNS=0;secure=false;faults.stop() }
  }
  private func refreshContext() {
    let refreshStart=uptimeNs()
    defer {
      let cost=uptimeNs()-refreshStart
      lock.withLock { contextRefreshCount+=1; contextRefreshTotalNS+=cost; contextRefreshMaxNS=max(contextRefreshMaxNS,cost) }
    }
    let context=listenerContext.snapshot
    _=listenerContext.refresh()
    windows.refresh()
    guard let value=context.value,context.hostNS != appliedContextHostNS else { return }
    appliedContextHostNS=context.hostNS
    let conservativeHost=context.startedHostNS>0 ? context.startedHostNS : context.hostNS
    if !value.listenAccess {
      stop(); lock.withLock { phase="access_revoked";faults.revokeAccess();listenAccessSnapshot=false;listenAccessObservedNS=conservativeHost }
      broadcast(["kind":"input_gap","reason":"listen_access_revoked","host_ns":String(refreshStart),
        "tap_fault_policy":lock.withLock {faults.dict}]); return
    }
    let enabled=value.tapEnabled
    let newlyDisabled=lock.withLock {
      guard conservativeHost >= faults.faultHostNS, !faults.blocksRestart else { return false }
      let changed=enabledSnapshot && !enabled; enabledSnapshot=enabled; return changed
    }
    if newlyDisabled { broadcast(["kind":"input_gap","reason":"tap_not_enabled_at_context_check","host_ns":String(refreshStart)]) }
    let secureNow=value.secureInput
    let changed=lock.withLock { let c=secure != secureNow; foreground=value.foregroundPID; secure=secureNow; snapshotNS=conservativeHost;listenAccessSnapshot=value.listenAccess;listenAccessObservedNS=conservativeHost; return c }
    if changed { broadcast(["kind":"input_gap","reason":secureNow ? "secure_input_enabled" : "secure_input_ended","host_ns":String(uptimeNs())]) }
    if let heldTap=tap, let ticket=lock.withLock({faults.beginRecovery(access:value.listenAccess,observedBeginNS:conservativeHost,now:refreshStart)}) {
      CGEvent.tapEnable(tap:heldTap,enable:true)
      let recovered=CFMachPortIsValid(heldTap) && CGEvent.tapIsEnabled(tap:heldTap)
      let applied=lock.withLock { () -> Bool in
        guard faults.completeRecovery(ticket:ticket,enabled:recovered) else { return false }
        phase=faults.state;enabledSnapshot=recovered;return true
      }
      if applied { broadcast(["kind":"input_listener","state":recovered ? "listening_after_timeout" : "recovery_failed",
        "host_ns":String(uptimeNs()),"tap_fault_policy":lock.withLock{faults.dict},
        "coverage":"recovery does not reconstruct omitted events or prove provider delivery"])
        if !recovered {retireFaultedTap()}
      }
    }
  }
  /// Only this process's passive tap is retired; app input remains available.
  private func retireFaultedTap() {
    if let tap { CFMachPortInvalidate(tap) }
    if let source { CFRunLoopRemoveSource(CFRunLoopGetMain(),source,.commonModes) }
    tap=nil;source=nil;lock.withLock {contextTap=nil;enabledSnapshot=false}
  }
  func handleTapDisable(userInput: Bool) {
    let host=uptimeNs()
    let applied=lock.withLock { () -> Bool in
      guard faults.disable(userInput:userInput,at:host) else { return false }
      phase=faults.state;enabledSnapshot=false;return true
    }
    guard applied else { return }
    broadcast(["kind":"input_gap","reason":userInput ? "tap_disabled_by_user_input" : "tap_timeout",
      "host_ns":String(host),"tap_fault_policy":lock.withLock {faults.dict}])
    if lock.withLock({faults.blocksRestart}) {retireFaultedTap()}
    else {_=listenerContext.refresh()}
  }
  private func receive(_ type: CGEventType, _ event: CGEvent) {
    let received=uptimeNs()
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      handleTapDisable(userInput:type == .tapDisabledByUserInput)
      return
    }
    guard let ticket=admit(type:type.rawValue,received:received) else { return }
    func value(_ field: CGEventField) -> Int64 { event.getIntegerValueField(field) }
    let window=value(.mouseEventWindowUnderMousePointer)
    var sample=InteractionSample(type:type.rawValue,receivedNS:received,eventNS:event.timestamp,
      destinationPID:Int32(clamping:value(.eventTargetUnixProcessID)),sourcePID:Int32(clamping:value(.eventSourceUnixProcessID)),
      sourceTag:value(.eventSourceUserData),windowUnderPointer:window>0 && window<=Int64(UInt32.max) ? UInt32(window) : 0,
      x:event.location.x,y:event.location.y,flags:event.flags.rawValue)
    let context=lock.withLock { (foreground,snapshotNS,secure) }
    sample.foregroundPID=context.0; sample.contextNS=context.1
    sample.secureInput=sample.keyboard ? IsSecureEventInputEnabled() : context.2
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
    q.async { [self] in process(copied,ticket:ticket); lock.withLock { pending-=1 } }
  }
  private func admit(type:UInt32,received:UInt64) -> InputQueueTicket? {
    lock.withLock {
      callbacks+=1;observedTypes[type,default:0]+=1
      guard faults.acceptsEvents else {faultOmittedCallbacks+=1;return nil}
      guard pending<Self.capacity else {
        overflow+=1
        if pendingOverflow==nil {pendingOverflow=InputQueueLoss()}
        pendingOverflow!.append(sequence:UInt64(callbacks),host:received,type:type)
        return nil
      }
      pending+=1
      let ticket=InputQueueTicket(sequence:UInt64(callbacks),overflowTotal:overflow,loss:pendingOverflow)
      pendingOverflow=nil;return ticket
    }
  }
  private func emitLoss(_ loss:InputQueueLoss) {
    for s in subscribers.values {
      var row=loss.row;row["drag_contexts_invalidated"]=s.policy.invalidateContinuity()
      s.callback(row)
    }
  }
  private func process(_ event: InteractionSample,ticket:InputQueueTicket) {
    let context=windows.snapshot
    let snapshot=(ticket.overflowTotal,context.transientWindows,context.hostNS)
    if let loss=ticket.loss {emitLoss(loss)}
    for s in subscribers.values {
      s.context.foregroundPID=event.foregroundPID
      s.context.transientWindows=s.context.pid.flatMap { snapshot.1[$0] } ?? []
      s.context.actionIDs=ActionTimeline.shared.activeIDs(sessionID:s.sessionID,pid:s.context.pid,windowID:s.context.windowID,at:event.receivedNS)
      let decision=s.policy.evaluate(event,s.context)
      guard decision.retain else { s.excluded+=1; continue }
      s.retained+=1
      var row: [String: Any] = ["kind":"input_event","type":event.type,"received_host_ns":String(event.receivedNS),
        "event_timestamp_ns":String(event.eventNS),"event_clock_qualification":"raw CG timestamp; normalized timeline uses recorder receipt time",
        "callback_sequence":String(ticket.sequence),"callback_sequence_qualification":"this listener instance; receipt order, not provider delivery completeness",
        "source_pid":event.sourcePID,"source_tag":String(event.sourceTag),"destination_pid":event.destinationPID,
        "window_under_pointer":event.windowUnderPointer,"flags":String(event.flags),"relevance_reasons":decision.reasons,
        "scope_certainty":decision.certainty,"action_ids":decision.actionIDs,"ownership":"unknown",
        "context_snapshot_host_ns":String(event.contextNS),"foreground_pid":event.foregroundPID,
        "window_context_snapshot_host_ns":String(snapshot.2),
        "window_context_qualification":"asynchronous PID/layer candidate; parent/window ownership not proven",
        "window_context_stale":snapshot.2==0 || (event.receivedNS>=snapshot.2 && event.receivedNS-snapshot.2>2_000_000_000),
        "window_context_snapshot_after_event":snapshot.2>event.receivedNS,
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
#if RECORD_SCREEN_QUALIFICATION
  /// Authored scalar samples only. Never creates a CGEvent/tap or posts input.
  func qualificationActivate() { qualificationNoTap=true;lock.withLock {faults.activate();phase="qualification_no_OS_tap"} }
  func qualificationReceive(_ sample:InteractionSample) {
    guard let ticket=admit(type:sample.type,received:sample.receivedNS) else {return}
    q.async { [self] in process(sample,ticket:ticket);lock.withLock {pending-=1} }
  }
  func qualificationBarrier(_ completion:@escaping @Sendable ()->Void) {q.async(execute:completion)}
#endif
}
