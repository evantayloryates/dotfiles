import Foundation

/// Scalar-only ingress loss. Receipt/callback ordering, not physical delivery
/// or actor attribution. One bounded aggregate travels with the next accepted
/// callback; no dropped positions, key codes or text are retained.
struct InputQueueLoss: Sendable {
  var count=0
  var firstSequence:UInt64=0, lastSequence:UInt64=0
  var firstHost:UInt64=0, lastHost:UInt64=0
  var types:[UInt32:Int]=[:]
  var typesUncounted=0
  var overflowBefore=0
  mutating func append(sequence:UInt64,host:UInt64,type:UInt32) {
    if count==0 {firstSequence=sequence;firstHost=host}
    count+=1;lastSequence=sequence;lastHost=host
    // The actual tap mask has fourteen types; unexpected types remain bounded.
    if types[type] != nil || types.count<32 {types[type,default:0]+=1} else {typesUncounted+=1}
  }
  var row:[String:Any] { ["kind":"input_gap","reason":"queue_overflow",
    "events_skipped":count,"host_ns":String(firstHost),
    "global_events_skipped":count,"global_overflow_total_after":overflowBefore+count,
    "first_lost_callback_sequence":String(firstSequence),"last_lost_callback_sequence":String(lastSequence),
    "first_lost_received_host_ns":String(firstHost),"last_lost_received_host_ns":String(lastHost),
    "global_loss_type_counts":Dictionary(uniqueKeysWithValues:types.map{(String($0.key),$0.value)}),
    "type_count_events_unrepresented":typesUncounted,
    "ordering":"recorder callback receipt order; emitted after preceding accepted callbacks",
    "ownership":"unknown; omitted events cannot be scoped or reconstructed"] }
}
struct InputQueueTicket: Sendable {
  let sequence:UInt64
  let overflowTotal:Int
  let loss:InputQueueLoss?
}
