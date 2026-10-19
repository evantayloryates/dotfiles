import Foundation
@main struct InventoryTest {
  static func main() {
    var checks = 0
    func check(_ want:Bool, layer:Int=0, width:Double=200, height:Double=100, bundle:String="com.test.app", title:String="owned", onScreen:Bool=true, own:Bool=false, offscreen:Bool=true, transient:Bool=false) {
      precondition(WindowInventoryPolicy.includes(layer:layer,width:width,height:height,bundle:bundle,title:title,onScreen:onScreen,ownProcess:own,includeOffscreen:offscreen,includeTransients:transient)==want);checks+=1
    }
    check(true);check(false,layer:3);check(false,width:99);check(false,height:59)
    check(false,bundle:"com.test.xpc.helper");check(false,title:"",onScreen:false)
    check(true,title:"owned",onScreen:false);check(false,onScreen:false,offscreen:false)
    check(true,layer:3,transient:true);check(true,width:12,height:12,bundle:"com.test.xpc.helper",transient:true)
    check(true,title:"",onScreen:false,transient:true);check(false,onScreen:false,offscreen:false,transient:true)
    for t in [false,true] {check(false,own:true,transient:t);check(false,layer:-1,transient:t);check(false,width:0,transient:t);check(false,width:.nan,transient:t);check(false,height:.infinity,transient:t)}
    print("{\"passed\":\(checks),\"scope\":\"normal/transient inventory policy; no UI or SDK call\"}")
  }
}
