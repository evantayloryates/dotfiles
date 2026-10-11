// Pure parser checks: no application, SDK discovery, session or capture.
import Foundation

@main struct RequestContractTest {
  static func main() throws {
    var checks=0
    func accept(_ method:String,_ p:[String:Any]) throws {try RPCNumber.validate(method,p);checks+=1}
    func reject(_ method:String,_ p:[String:Any]) {
      do {try RPCNumber.validate(method,p);fatalError("invalid request accepted: \(method)")}
      catch let e as RPCError {guard e.code=="bad_params" else {fatalError("wrong error")};checks+=1}
      catch {fatalError("wrong error type")}
    }
    let display:[String:Any]=["type":"display"],rect:[String:Any]=["type":"rect","x":0,"y":0,"w":800,"h":600]
    try accept("windows.list",[:]);try accept("windows.list",["app":"", "title":"fixture","include_transients":true,"on_screen_only":false,"limit":1000])
    for p:[String:Any] in [["include_transient":true],["app":3],["title":NSNull()],["app":String(repeating:"x",count:257)],["include_transients":1],["on_screen_only":"true"],["limit":1.5]] {reject("windows.list",p)}
    for method in ["frame.resolve","frame.verify","overlay.show","record.schedule"] {
      try accept(method,["target":display])
      reject(method,["target":display,"include_apps":["com.test.Owned"]])
      reject(method,["target":["type":"display","include_app":["com.test.Owned"]]])
      reject(method,["target":["type":"window","window_id":1,"include_children":true]])
      reject(method,["target":["type":"display","window_id":1]])
      reject(method,["target":["type":"rect","x":0,"y":0,"w":800,"h":600,"display_id":1]])
      reject(method,["target":["type":"window","window_id":1,"app":3]])
      reject(method,[:])
    }
    try accept("frame.resolve",["target":["type":"window","title":"fixture"]])
    try accept("frame.verify",["target":rect,"format":"png","quality":1,"max_width":0,"path":"/tmp/fixture.png","session":["title":"owned","purpose":"test","tags":["fixture"]]])
    for p:[String:Any] in [["format":"gif"],["format":3],["quality":true],["quality":1.1],["path":3],["session":["titles":"owned"]],["session":["tags":[1]]],["session":["title":3]]] {
      reject("frame.verify",p.merging(["target":rect]) {a,_ in a})
    }
    try accept("record.schedule",["target":display,"session_id":"owned","label":"fixture","idempotency_key":"one","fps":30,"codec":"h264","show_cursor":false,"input":["enabled":false]])
    try accept("record.schedule",["target":display,"caller":["agent":"codex","agent_session_id":"owned","cwd":"/tmp","client":"fixture@55"]])
    reject("record.schedule",["target":display,"caller":"codex"])
    reject("record.schedule",["target":display,"caller":["agent":1]])
    for key in ["preset","codec","if_late"] {reject("record.schedule",["target":display,key:3])}
    reject("record.schedule",["target":display,"idempotency_key":"one","max_width":true])
    reject("record.schedule",["target":display,"input":["ambiguous_key":"all"]])
    reject("overlay.show",["target":display,"capturable":"false"])
    reject("frame.resolve",["target":["type":"window","window_id":1,"app":" "]])
    reject("frame.resolve",["target":["type":"window","window_id":1,"title":""]])
    for (app,title,expected):(String?,String?,Bool) in [(nil,nil,true),("com.apple.TextEdit",nil,true),("text","fixture",true),("Finder",nil,false),(nil,"wrong",false),("TextEdit","wrong",false)] {
      guard TargetSpec.matchesWindow(app:app,title:title,bundle:"com.apple.TextEdit",name:"TextEdit",windowTitle:"Owned Fixture")==expected else {fatalError("selector constraints ignored")};checks+=1
    }
    print("{\"passed\":\(checks),\"scope\":\"strict native discovery/capture entry and target parsers; no SDK, filesystem or UI\"}")
  }
}
