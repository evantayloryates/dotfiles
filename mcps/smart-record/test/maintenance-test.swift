import Foundation
final class MaintenanceClock:@unchecked Sendable {
  private let lock=NSLock();private var ns:UInt64=10
  func read()->UInt64{lock.withLock{ns}}
  func advance(_ seconds:UInt64){lock.withLock{ns+=seconds*1_000_000_000}}
}
@main struct MaintenanceTest {
 static func main() throws {
  let clock=MaintenanceClock(),f=MaintenanceFence(clock:{clock.read()});var checks=0
  func check(_ b:Bool,_ why:String){guard b else{fatalError(why)};checks+=1}
  func failure(_ code:String,_ op:() throws->Void) {do {try op();fatalError("unexpected admission")}catch let e as RPCError{check(e.code==code,"expected refusal")}catch{fatalError("wrong error")}}
  failure("maintenance_busy"){_=try f.reserve(seconds:10)}
  failure("engine_loading"){_=try f.enter("record.schedule")}
  f.didLoad();let admitted=try f.enter("record.schedule");check(admitted,"count mutating work")
  failure("maintenance_busy"){_=try f.reserve(seconds:10)}
  f.leave();let token=try f.reserve(seconds:10)
  failure("maintenance_busy"){_=try f.enter("record.schedule")}
  check(try f.enter("status")==false,"readback remains available")
  failure("maintenance_expired"){try f.validate(token)}
  failure("maintenance_expired"){try f.release("other")}
  try f.prepare(token,blockers:[]);try f.validate(token);check(f.status["ready"] as? Bool==true,"ready checked lease")
  failure("maintenance_busy"){_=try f.reserve(seconds:10)}
  try f.release(token);check(f.status["reserved"] as? Bool==false,"release opens admission")
  let bad=try f.reserve(seconds:10)
  failure("maintenance_busy"){try f.prepare(bad,blockers:["peer recording"])}
  check(f.status["reserved"] as? Bool==false,"failed census releases own provisional fence")
  let expired=try f.reserve(seconds:5);clock.advance(6)
  failure("maintenance_expired"){try f.prepare(expired,blockers:[])}
  check(f.status["reserved"] as? Bool==false,"expiry opens admission without restart")
  let restart=try f.reserve(seconds:5);try f.prepare(restart,blockers:[]);try f.commitRestart(restart);clock.advance(100)
  check(f.status["reserved"] as? Bool==true,"commit pins fence beyond original TTL")
  check(f.status["restart_committed"] as? Bool==true,"commit state visible")
  failure("maintenance_busy"){_=try f.enter("frame.verify")}
  failure("maintenance_expired"){try f.commitRestart(restart)}
  failure("maintenance_expired"){try f.release(restart)}
  for budget in [0.0,4.0,181.0,Double.infinity,Double.nan] {failure("bad_params"){_=try f.reserve(seconds:budget)}}
  print("{\"passed\":\(checks),\"scope\":\"loading, admitted work, provisional census, token ownership, expiry and pinned single restart; no SDK, UI or process exit\"}")
 }
}
