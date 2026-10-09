import Foundation
@main struct SparseRecordingTest {
 static func main() async throws {
  let root=URL(fileURLWithPath:CommandLine.arguments[1]);try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
  var checks=0
  func check(_ ok:Bool,_ text:String){guard ok else{fputs("failed: \(text)\n",stderr);exit(1)};checks+=1}
  func wait(_ r:Recording) async {
   for _ in 0..<5000 {
    if r.state.terminal && !r.holdsUnfinishedAdmission && (r.describe()["source_packet"] as? [String:Any])?["state"] as? String=="closed" {return}
    try? await Task.sleep(nanoseconds:1_000_000)
   }
   fatalError("owned sparse writer deadline")
  }
  func make(_ name:String,_ duration:Double) throws -> Recording {
   let now=Date();return Recording(id:name,dir:root.appendingPathComponent(name).path,target:["type":"authored_offscreen_sparse"],settings:try RecordSettings.from(["fps":30]),label:name,startAt:now,endAt:now.addingTimeInterval(duration),ifLate:"start",idempotencyKey:nil,sessionID:nil)
  }
  check(SparseFramePadding.timestamps(after:0,before:1_000_000_000)==[],"no interior stamp on exact interval")
  check(SparseFramePadding.timestamps(after:0,before:1_000_000_001)==[1_000_000_000],"nanosecond boundary stays exact")
  check(SparseFramePadding.timestamps(after:UInt64.max-2_000_000_000,before:UInt64.max)==[UInt64.max-1_000_000_000],"large host time remains overflow safe")
  check(SparseFramePadding.timestamps(after:0,before:66_000_000_000)==nil,"padding work bounded")
  let r=try make("resumed",22.566666666);try r.qualificationSparseSetup(22.566666666)
  for (offset,value) in [(0.0,20),(0.033333333,20),(1.0,40),(3.5,60),(22.5,200),(22.533333333,200)] {try r.qualificationSparseSource(offset,UInt8(value))}
  check(r.state == .recording,"large gap no longer fails writer on resume")
  r.qualificationSparseFinish();await wait(r);check(r.state == .done,"real repaired sparse writer finalizes")
  check(r.describe()["writer_failure"] is NSNull,"healthy sparse take has no false failure diagnostic")
  let budget=try make("budget",200);try budget.qualificationSparseSetup(200)
  try budget.qualificationSparseSource(0,20);try budget.qualificationSparseSource(1,40);try budget.qualificationSparseSource(80,200)
  await wait(budget);check(budget.state == .interrupted,"oversized padding trims only affected take")
  check((budget.describe()["error"] as? String)?.contains("bounded padding") == true,"bounded failure explanation retained")
  let clock=try make("clock-gap",50);try clock.qualificationSparseSetup(50)
  try clock.qualificationSparseSource(0,20);try clock.qualificationSparseSource(1,40);clock.qualificationSparseClockGap()
  await wait(clock);check(clock.state == .interrupted,"clock gap remains interrupted")
  check((clock.describe()["error"] as? String)?.contains("without filling") == true,"clock uncertainty not padded")
  let backpressure=try make("backpressure",30);try backpressure.qualificationSparseSetup(30)
  try backpressure.qualificationSparseSource(0,20);try backpressure.qualificationSparseSource(1,40)
  backpressure.qualificationRejectSparseFrame=true
  try backpressure.qualificationSparseSource(20,200);await wait(backpressure)
  check(backpressure.state == .interrupted,"unfilled padding cannot silently complete stale footage")
  check((backpressure.describe()["error"] as? String)?.contains("backpressure") == true,"sparse backpressure reason retained")
  let failure=try make("diagnostic",22.566666666);try failure.qualificationSparseSetup(22.566666666)
  for offset in [0.0,0.033333333,1,3.5,22.5,22.533333333] {try failure.qualificationSparseSource(offset,100,raw:true)}
  failure.qualificationSparseFinish();await wait(failure)
  check(failure.state == .failed,"raw unpadded writer reproduces failure")
  let diagnostic=failure.describe()["writer_failure"] as? [String:Any]
  let underlying=(diagnostic?["error"] as? [String:Any])?["underlying"] as? [String:Any]
  check(underlying?["code"] as? Int == -17771,"real writer error chain retained without userInfo dump")
  let result:[String:Any]=["checks":checks,"resumed":r.describe(),"budget":budget.describe(),"clock-gap":clock.describe(),"backpressure":backpressure.describe(),"diagnostic":failure.describe()]
  try jsonData(result,options:[.prettyPrinted,.sortedKeys])!.write(to:root.appendingPathComponent("proof.json"));print("{\"checks\":\(checks),\"scope\":\"actual Recording sparse writer, bounded trim and clock-gap suppression; no capture/UI\"}")
 }
}
