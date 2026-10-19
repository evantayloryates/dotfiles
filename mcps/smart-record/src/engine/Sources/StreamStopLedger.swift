import Foundation

/// Tracks one request per owned stream. A deadline reports uncertainty; it
/// neither cancels/retries SDK work nor releases its admission reservation.
/// Only actual successful acknowledgment releases a reservation. Returned
/// errors remain unconfirmed until an explicitly idle process-maintenance step.
final class StreamStopLedger: @unchecked Sendable {
  private struct Attempt {
    let id: UUID
    let start: UInt64
    let budget: Double
    var phase = "pending"
    var producerFinished = false
    var deadlineExceeded = false
    var end: UInt64?
    var error: String?
    var dict: [String:Any] {
      ["id":id.uuidString,"state":phase,"started_ns":String(start),
       "completed_ns":end.map(String.init) as Any? ?? NSNull(),"deadline_s":budget,
       "deadline_exceeded":deadlineExceeded,"producer_finished":producerFinished,
       "acknowledged":phase == "acknowledged","error":error as Any? ?? NSNull()]
    }
  }
  private let lock=NSLock()
  private var attempts:[UUID:Attempt]=[:]
  private var latest:[String:Any]?
  private var requests=0
  let recordingID:String
  var onChange:(@Sendable ([String:Any])->Void)?
  init(recordingID:String) {self.recordingID=recordingID}
  var heldCount:Int {lock.withLock {attempts.count}}
  var status:[String:Any] {lock.withLock {
    ["recording_id":recordingID,"requests":requests,"admission_held":!attempts.isEmpty,"held_count":attempts.count,
     "producer_pending":attempts.values.filter{!$0.producerFinished}.count,
     "overdue":attempts.values.filter{$0.phase == "overdue"}.count,
     "unconfirmed_errors":attempts.values.filter{$0.phase == "unconfirmed"}.count,
     "attempts":attempts.values.sorted{$0.start<$1.start}.map(\.dict),
     "latest_result":latest as Any? ?? NSNull(),
     "qualification":"SDK acknowledgment; not independently measured hardware release"]
  } }
  func start(seconds:Double=3,operation:@escaping @Sendable () async throws -> Void) {
    precondition(seconds>0 && seconds.isFinite)
    let attempt=Attempt(id:UUID(),start:uptimeNs(),budget:seconds)
    lock.withLock {attempts[attempt.id]=attempt;requests+=1}
    // Notify after releasing the ledger lock: recording observers may read it.
    onChange?(status)
    DispatchQueue.global().asyncAfter(deadline:.now()+seconds) {[weak self] in self?.expire(attempt.id)}
    Task {
      do {try await operation();self.complete(attempt.id,error:nil)}
      catch {self.complete(attempt.id,error:String(describing:error))}
    }
  }
  private func expire(_ id:UUID) {
    let changed=lock.withLock {
      guard var a=attempts[id],!a.producerFinished,!a.deadlineExceeded else{return false}
      a.phase="overdue";a.deadlineExceeded=true;attempts[id]=a;return true
    }
    if changed {onChange?(status)}
  }
  private func complete(_ id:UUID,error:String?) {
    let changed=lock.withLock {
      guard var a=attempts[id],!a.producerFinished else{return false}
      a.producerFinished=true;a.end=uptimeNs()
      if let error {
        a.phase="unconfirmed";a.error=String(error.prefix(512));attempts[id]=a
      } else {a.phase="acknowledged";attempts[id]=nil}
      latest=a.dict
      return true
    }
    if changed {onChange?(status)}
  }
}
