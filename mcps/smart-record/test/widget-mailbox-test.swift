import Foundation

@main struct WidgetMailboxTest {
  static func main() async throws {
    var checks=0
    func check(_ value:Bool){precondition(value,"Mailbox check \(checks+1) failed");checks+=1}
    let folder=FileManager.default.temporaryDirectory.appendingPathComponent("widget-mailbox-"+UUID().uuidString)
    try ControlMailbox.prepare(folder)
    defer{try? FileManager.default.removeItem(at:folder)}
    func request(_ paused:Bool=true,age:Double=0,duration:Double=10)throws->ControlMailbox.Request {
      let created=Date().addingTimeInterval(-age)
      let row=ControlMailbox.Request(id:UUID(),paused:paused,createdAt:created,expiresAt:created.addingTimeInterval(duration))
      try ControlMailbox.write(row,to:folder.appendingPathComponent(row.id.uuidString+".request"));return row
    }
    func receipt(_ row:ControlMailbox.Request)->ControlMailbox.Receipt? {
      ControlMailbox.read(ControlMailbox.Receipt.self,from:folder.appendingPathComponent(row.id.uuidString+".receipt"))
    }
    func sample(_ paused:Bool)->Snapshot {Snapshot(sampledAt:Date(),phase:paused ? "paused" : "idle",active:0,queued:0,actions:0,paused:paused)}
    var applied=[Bool](),published=false
    let pause=try request()
    check(ControlMailbox.process(directory:folder,publish:{_ in published=true}){value in applied.append(value);return sample(value)})
    check(applied == [true]);check(published);check(receipt(pause)?.confirmed==true)
    check(!ControlMailbox.process(directory:folder,publish:{_ in}){_ in preconditionFailure("Replay")})
    // Re-presenting the same ID cannot re-execute an already claimed request.
    try ControlMailbox.write(pause,to:folder.appendingPathComponent(pause.id.uuidString+".request"))
    check(!ControlMailbox.process(directory:folder,publish:{_ in}){_ in preconditionFailure("Duplicate replay")})
    try FileManager.default.removeItem(at:folder.appendingPathComponent(pause.id.uuidString+".request"))
    for (age,duration) in [(11.0,10.0),(-6.0,10.0),(0.0,11.0)] {
      let row=try request(age:age,duration:duration)
      check(ControlMailbox.process(directory:folder,publish:{_ in}){_ in preconditionFailure("Expired/invalid request executed")})
      check(receipt(row)?.confirmed==false)
    }
    let failure=try request(false)
    check(ControlMailbox.process(directory:folder,publish:{_ in}){_ in throw RecorderControl.Failure("Unknown socket outcome")})
    check(receipt(failure)?.confirmed==false)
    check(!ControlMailbox.process(directory:folder,publish:{_ in}){_ in preconditionFailure("Unknown outcome replay")})
    let mismatch=try request(false)
    _ = ControlMailbox.process(directory:folder,publish:{_ in preconditionFailure("Wrong state published")}){_ in sample(true)}
    check(receipt(mismatch)?.confirmed==false)
    let symlink=folder.appendingPathComponent("linked.json")
    try FileManager.default.createSymbolicLink(at:symlink,withDestinationURL:folder.appendingPathComponent(pause.id.uuidString+".receipt"))
    check(ControlMailbox.read(ControlMailbox.Receipt.self,from:symlink)==nil)
    let tooLarge=folder.appendingPathComponent("large.json")
    try Data(repeating:65,count:16385).write(to:tooLarge)
    check(ControlMailbox.read(ControlMailbox.Receipt.self,from:tooLarge)==nil)
    // Exercise the asynchronous client waiting for actual publication/receipt.
    let client=Task {try await ControlMailbox.submit(paused:false,directory:folder)}
    var handled=false
    for _ in 0..<20 {
      try await Task.sleep(nanoseconds:20_000_000)
      handled=ControlMailbox.process(directory:folder,publish:{_ in}){value in applied.append(value);return sample(value)}
      if handled {break}
    }
    let ack=try await client.value
    check(handled);check(ack.confirmed);check(applied == [true,false])
    let attrs=try FileManager.default.attributesOfItem(atPath:folder.appendingPathComponent(ack.id.uuidString+".receipt").path)
    check((attrs[.posixPermissions] as? Int)==0o600)
    print("\(checks) widget mailbox checks passed")
  }
}
