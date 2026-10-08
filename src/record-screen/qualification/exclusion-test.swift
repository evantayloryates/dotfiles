import Foundation

final class ExclusionChanges:@unchecked Sendable {
  let lock=NSLock();private var values:[ExclusionIdentityChange]=[]
  func append(_ value:ExclusionIdentityChange){lock.withLock{values.append(value)}}
  var all:[ExclusionIdentityChange]{lock.withLock{values}}
}

@main struct ExclusionTest {
  static func main() throws {
    var checks=0
    func check(_ value:Bool,_ name:String){guard value else{fatalError(name)};checks+=1}
    let tracker=ExclusionIdentityTracker(),events=ExclusionChanges()
    let a=ExclusionAppIdentity(pid:7,launch:"10"),b=ExclusionAppIdentity(pid:8,launch:"20")
    do {_=try tracker.subscribe(["test.A"],onChange:{events.append($0)});fatalError("unknown snapshot")}catch{checks+=1}
    tracker.observe(["test.A":[a]],at:10)
    let first=try tracker.subscribe(["test.A"],onChange:{events.append($0)})
    try first.validateResolved(["test.A":[7]]);checks+=1
    tracker.observe(["test.A":[a],"unrelated.app":[b]],at:11)
    check(first.change==nil && events.all.isEmpty,"unrelated changes do not interrupt")
    tracker.observe(["test.A":[b]],at:12)
    check(events.all.count==1 && first.change?.observedNS==12,"replacement is detected once")
    check(events.all[0].before==[a] && events.all[0].after==[b],"old and new identities preserved")
    do {try first.validate();fatalError("changed lease valid")}catch{checks+=1}
    tracker.observe(["test.A":[a]],at:13)
    check(events.all.count==1 && first.change != nil,"return to same PID cannot repair an invalid take")
    tracker.unsubscribe(first)
    let fresh=try tracker.subscribe(["test.A"],onChange:{events.append($0)})
    try fresh.validate();checks+=1
    do {try fresh.validateResolved(["test.A":[8]]);fatalError("stale SDK filter valid")}catch{checks+=1}
    tracker.observe(["test.A":[ExclusionAppIdentity(pid:7,launch:"30")]],at:14)
    check(events.all.count==2,"reused PID with different launch identity is detected")
    tracker.unsubscribe(fresh)
    tracker.observe(["test.A":[a,b]],at:15)
    let multiple=try tracker.subscribe(["test.A"],onChange:{events.append($0)})
    try multiple.validateResolved(["test.A":[7,8]]);checks+=1
    tracker.observe(["test.A":[b]],at:16)
    check(multiple.change?.after==[b],"one of several helper processes exited")
    tracker.unsubscribe(multiple)
    let absent=try tracker.subscribe(["test.A"],onChange:{events.append($0)})
    tracker.observe([:],at:17)
    check(absent.change?.after.isEmpty==true,"termination observes empty process set")
    tracker.unsubscribe(absent)
    do {_=try tracker.subscribe(["test.A"],onChange:{events.append($0)});fatalError("absent helper allowed")}catch{checks+=1}
    tracker.observe(["test.A":[a]],at:18)
    let removed=try tracker.subscribe(["test.A"],onChange:{events.append($0)})
    tracker.unsubscribe(removed);tracker.unsubscribe(removed)
    tracker.observe(["test.A":[b]],at:19)
    check(removed.change==nil,"unsubscribed lease sees no later transitions")
    var leases:[ExclusionIdentityLease]=[]
    for _ in 0..<16 {leases.append(try tracker.subscribe(["test.A"],onChange:{events.append($0)}));checks+=1}
    do {_=try tracker.subscribe(["test.A"],onChange:{events.append($0)});fatalError("capacity ignored")}catch{checks+=1}
    tracker.observe(["test.A":[a]],at:20)
    check(leases.allSatisfy{$0.change != nil},"one transition fans out to every interested take")
    for lease in leases {tracker.unsubscribe(lease)}
    check(tracker.status["leases"] as? Int==0,"all admission released")
    // Reentrant callback proves delivery happens outside the tracker lock.
    let reentrant=try tracker.subscribe(["test.A"],onChange:{_ in _=tracker.status})
    tracker.observe(["test.A":[b]],at:21)
    check(reentrant.change != nil,"callback can read status without deadlocking")
    tracker.unsubscribe(reentrant)
    print("{\"passed\":\(checks),\"scope\":\"mechanical lifecycle, stale SDK filter, PID reuse, capacity, fanout and callback reentrancy; no live application observation\"}")
  }
}
