import Foundation

final class RecordingQueryGate:@unchecked Sendable {
  let entered=DispatchSemaphore(value:0),release=DispatchSemaphore(value:0)
  let lock=NSLock();var calls=0;var requests:[Set<UInt32>]=[]
  func run(_ requested:Set<UInt32>)->WindowContextResult {
    let i=lock.withLock{calls+=1;requests.append(requested);return calls}
    if i==1{entered.signal();release.wait()}
    return WindowContextResult(requestedWindows:requested,windowStates:Dictionary(uniqueKeysWithValues:requested.map{($0,WindowMonitorState(frame:CGRect(x:20,y:30,width:600,height:400),onScreen:true,pid:100,hidden:false))}))
  }
}
@main struct RecordingWindowContextTest {
  static func main(){
    var n=0
    func check(_ v:Bool,_ label:String){guard v else{fatalError(label)};n+=1}
    let gate=RecordingQueryGate(),context=RecordingWindowContext(query:{gate.run($0)})
    context.subscribe("first",window:1,pid:100)
    check(gate.entered.wait(timeout:.now()+1) == .success,"enumeration held away from recording queue")
    for i in 2...16{context.subscribe(String(i),window:UInt32(i),pid:100);_=context.refresh()}
    check(gate.lock.withLock{gate.calls}==1,"one shared worker across sixteen takes")
    for i in 1...16{context.unsubscribe(i==1 ? "first" : String(i))}
    context.subscribe("new",window:99,pid:200)
    for _ in 0..<100{_=context.refresh();check(gate.lock.withLock{gate.calls}==1,"closed takes cannot release stuck producer slot")}
    gate.release.signal()
    for _ in 0..<1000{if context.status["recording_window_context_refresh_in_flight"] as? Bool==false{break};Thread.sleep(forTimeInterval:0.001)}
    check(context.refresh().requestedWindows.isEmpty,"old generation cannot publish old target as current")
    Thread.sleep(forTimeInterval:0.51);_=context.refresh()
    for _ in 0..<1000{if context.status["recording_window_context_refresh_in_flight"] as? Bool==false{break};Thread.sleep(forTimeInterval:0.001)}
    let fresh=context.refresh();check(fresh.requestedWindows==[99],"fresh interests recovered after actual drain")
    check(fresh.windowStates[99]?.pid==100,"preserve returned owner for caller lifetime comparison")
    context.unsubscribe("new");check(context.refresh().requestedWindows.isEmpty,"last unsubscribe clears snapshots")
    print("{\"passed\":\(n),\"scope\":\"shared disturbance worker across takes, stuck work retained after stop, old generation rejected, fresh recovery; no Quartz/UI\"}")
  }
}
