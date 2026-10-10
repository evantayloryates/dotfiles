import WidgetKit
import SwiftUI

struct ProductionEntry:TimelineEntry {let date:Date;let snapshot:Snapshot;let expired:Bool}
struct ProductionProvider:TimelineProvider {
  func placeholder(in context:Context)->ProductionEntry {ProductionEntry(date:Date(),snapshot:.unavailable,expired:true)}
  func getSnapshot(in context:Context,completion:@escaping(ProductionEntry)->Void) {let s=WidgetBridge.read();completion(ProductionEntry(date:Date(),snapshot:s,expired:s.stale))}
  func getTimeline(in context:Context,completion:@escaping(Timeline<ProductionEntry>)->Void) {
    let s=WidgetBridge.read(),now=Date(),expiry=max(now.addingTimeInterval(1),s.sampledAt.addingTimeInterval(30))
    completion(Timeline(entries:[ProductionEntry(date:now,snapshot:s,expired:s.stale),ProductionEntry(date:expiry,snapshot:s,expired:true)],policy:.after(now.addingTimeInterval(30))))
  }
}
struct ProductionView:View {
  let entry:ProductionEntry
  @Environment(\.widgetFamily) var family
  var body:some View {
    VStack(alignment:.leading,spacing:6) {
      Label("Screen recording",systemImage:"record.circle").font(.headline)
      Text(entry.expired ? "Check live status" : entry.snapshot.title).font(.title3.bold())
      Text("\(entry.snapshot.active) active · \(entry.snapshot.queued) queued · \(entry.snapshot.actions) actions").font(.subheadline)
      if entry.snapshot.sampledAt.timeIntervalSince1970>0 {
        HStack(spacing:4){Text("Sampled");Text(entry.snapshot.sampledAt,style:.relative);Text("ago")}.font(.caption).foregroundStyle(.secondary)
      } else {Text("Service status unavailable").font(.caption).foregroundStyle(.secondary)}
      if family == .systemLarge {Text("Pause lets current work finish safely. Your input stays available.").font(.caption)}
      HStack(spacing:18) {
        Link("Pause",destination:URL(string:"record-screen-control://pause")!)
        Link("Resume",destination:URL(string:"record-screen-control://resume")!)
        Link("Live panel",destination:URL(string:"record-screen-control://panel")!)
      }.font(.subheadline.bold())
      Text("macOS schedules refreshes; open the live panel for current state.").font(.caption2).foregroundStyle(.secondary)
    }.containerBackground(.fill.tertiary,for:.widget)
  }
}
@main
struct RecordScreenWidget:Widget {
  var body:some WidgetConfiguration {
    StaticConfiguration(kind:WidgetBridge.kind,provider:ProductionProvider()){ProductionView(entry:$0)}
      .configurationDisplayName("Screen recording")
      .description("Recording state and cooperative global Pause/Resume.")
      .supportedFamilies([.systemMedium,.systemLarge])
  }
}
