import AppKit
import CoreGraphics

/// One shared Quartz query for recording disturbance checks. A stuck producer
/// retains its single slot even after all takes close; another take cannot
/// create another blocked enumeration or block its frame/stop queue.
final class RecordingWindowContext:@unchecked Sendable {
  static let shared=RecordingWindowContext()
  private let lock=NSLock()
  private var interests:[String:(UInt32,Int32)]=[:]
  private var sampler:WindowContextSampler!
  init(query:@escaping @Sendable (Set<UInt32>)->WindowContextResult = {RecordingWindowContext.read($0)}){
    sampler=WindowContextSampler(prefix:"recording_window",intervalNS:500_000_000,query:{[weak self] in
      let requested=self?.lock.withLock{Set(self?.interests.values.map{$0.0} ?? [])} ?? []
      return query(requested)
    })
  }
  private static func read(_ requested:Set<UInt32>)->WindowContextResult {
      guard let rows=CGWindowListCopyWindowInfo(.optionAll,kCGNullWindowID) as? [[String:Any]] else {
        return WindowContextResult(gap:"recording_window_context_unavailable")
      }
      var states:[UInt32:WindowMonitorState]=[:]
      for row in rows {
        guard let id=(row[kCGWindowNumber as String] as? NSNumber)?.uint32Value,requested.contains(id),
              let bounds=row[kCGWindowBounds as String] as? NSDictionary,
              let frame=CGRect(dictionaryRepresentation:bounds),
              let pid=(row[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value else {continue}
        states[id]=WindowMonitorState(frame:frame,onScreen:(row[kCGWindowIsOnscreen as String] as? Bool) ?? false,
          pid:pid,hidden:NSRunningApplication(processIdentifier:pid)?.isHidden ?? false)
      }
      return WindowContextResult(requestedWindows:requested,windowStates:states)
  }
  func subscribe(_ recording:String,window:UInt32,pid:Int32){
    lock.withLock{let first=interests.isEmpty;interests[recording]=(window,pid);if first{sampler.activate()}}
    _=sampler.refresh()
  }
  func unsubscribe(_ recording:String){lock.withLock{guard interests.removeValue(forKey:recording) != nil else{return};if interests.isEmpty{sampler.deactivate()}}}
  func refresh()->WindowContextSnapshot{_=sampler.refresh();return sampler.snapshot}
  var status:[String:Any]{sampler.status}
}
