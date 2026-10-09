import Foundation

@main struct TapFaultTest {
  static func main() {
    var n=0
    func check(_ v:Bool,_ name:String) {guard v else{fputs("failed: \(name)\n",stderr);exit(1)};n+=1}
    var p=TapFaultPolicy()
    check(!p.disable(userInput:false,at:10),"inactive ignores late callback")
    p.activate();check(p.acceptsEvents && p.attempts==0,"active admits callbacks")
    check(p.disable(userInput:false,at:100) && !p.acceptsEvents,"timeout marks omission before recovery")
    check(p.beginRecovery(access:true,observedBeginNS:99,now:110)==nil,"pre-fault permission snapshot cannot recover")
    check(p.beginRecovery(access:false,observedBeginNS:101,now:110)==nil,"denied access cannot recover")
    check(p.beginRecovery(access:true,observedBeginNS:101,now:2_000_000_102)==nil,"stale permission cannot recover")
    check(p.beginRecovery(access:true,observedBeginNS:120,now:110)==nil,"future snapshot cannot recover")
    let first=p.beginRecovery(access:true,observedBeginNS:101,now:110)!
    check(p.attempts==1 && !p.acceptsEvents,"dispatched enable is not proof of recovery")
    check(p.beginRecovery(access:true,observedBeginNS:101,now:110)==nil,"duplicate enable not admitted")
    check(p.completeRecovery(ticket:first,enabled:true) && p.acceptsEvents,"actual enabled readback recovers")
    for i in 2...3 {
      check(p.disable(userInput:false,at:UInt64(i*100)),"later timeout admitted")
      let ticket=p.beginRecovery(access:true,observedBeginNS:UInt64(i*100+1),now:UInt64(i*100+2))!
      check(p.completeRecovery(ticket:ticket,enabled:true) && p.attempts==i,"bounded later attempt recovers")
    }
    check(p.disable(userInput:false,at:400) && p.blocksRestart,"fourth timeout exhausts recovery")
    check(p.beginRecovery(access:true,observedBeginNS:401,now:402)==nil,"exhausted budget cannot be bypassed by fresh permission")
    check(!p.disable(userInput:false,at:500),"terminal timeout does not restart a recovery cycle")
    p.stop();p.activate();check(p.attempts==0,"new listening lifecycle has a new budget")
    _=p.disable(userInput:false,at:600)
    let waiting=p.beginRecovery(access:true,observedBeginNS:601,now:602)!
    check(p.disable(userInput:true,at:603) && p.blocksRestart,"user disable overrides in-flight recovery")
    check(!p.completeRecovery(ticket:waiting,enabled:true) && !p.acceptsEvents,"late success cannot undo user disable")
    check(p.beginRecovery(access:true,observedBeginNS:604,now:605)==nil,"user disable never automatically recovers")
    p.stop();p.activate();_=p.disable(userInput:false,at:700)
    let fail=p.beginRecovery(access:true,observedBeginNS:701,now:702)!
    check(p.completeRecovery(ticket:fail,enabled:false) && p.blocksRestart,"failed actual enable is terminal")
    p.stop();p.activate();_=p.disable(userInput:false,at:800)
    let old=p.beginRecovery(access:true,observedBeginNS:801,now:802)!
    p.stop();p.activate()
    check(!p.completeRecovery(ticket:old,enabled:false) && p.acceptsEvents,"prior lifecycle cannot poison a replacement tap")
    _=p.disable(userInput:false,at:900)
    let revoke=p.beginRecovery(access:true,observedBeginNS:901,now:902)!
    p.revokeAccess()
    check(p.blocksRestart && !p.acceptsEvents,"revoked access blocks new subscriptions from restarting an existing scope")
    check(!p.completeRecovery(ticket:revoke,enabled:true),"late permission result cannot undo revocation")
    p.stop();check(!p.blocksRestart,"ending all scopes releases the explicit restart boundary")
    check(JSONSerialization.isValidJSONObject(p.dict),"diagnostic metadata serializes")
    print("{\"passed\":\(n),\"scope\":\"timeout budget, fresh permission interval, omission, user override, stale completions and lifecycle reset; no OS tap or input\"}")
  }
}
