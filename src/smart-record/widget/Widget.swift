import WidgetKit
import SwiftUI
import AppIntents

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
  @Environment(\.widgetRenderingMode) private var renderingMode
  private var gateLabel:some View {
    Label(entry.snapshot.paused ? "Resume" : "Pause",systemImage:entry.snapshot.paused ? "play.fill" : "pause.fill")
      .foregroundStyle(renderingMode == .fullColor ? .white : .primary)
  }
  @ViewBuilder private var gateButton:some View {
    if renderingMode == .fullColor {
      Button(intent:SetRecordingGateIntent(paused:!entry.snapshot.paused)) {gateLabel}
        .buttonStyle(.borderedProminent).tint(.blue)
    } else {
      // Desktop vibrancy flattens a prominent button's fill and white label
      // into the same light color. A transparent outlined control preserves
      // the same primary text contrast as the rest of the unfocused widget.
      Button(intent:SetRecordingGateIntent(paused:!entry.snapshot.paused)) {
        gateLabel.padding(.horizontal,12).padding(.vertical,7)
          .overlay(Capsule().stroke(.primary.opacity(0.65),lineWidth:1.5))
      }.buttonStyle(.plain)
    }
  }
  var body:some View {
    VStack(alignment:.leading,spacing:6) {
      Label("Smart Record",systemImage:"record.circle").font(.headline)
      Text(entry.expired ? "Check live status" : (entry.snapshot.paused ? "New work paused" : "Recording allowed")).font(.title3.bold())
      if entry.snapshot.phase == "unavailable" {Text("Counts unavailable").font(.subheadline)}
      else {Text("\(entry.expired ? "Last sample: " : "")\(entry.snapshot.active) active · \(entry.snapshot.queued) queued · \(entry.snapshot.actions) actions").font(.subheadline)}
      if entry.snapshot.sampledAt.timeIntervalSince1970>0 {
        HStack(spacing:4){Text("Sampled");Text(entry.snapshot.sampledAt,style:.relative);Text("ago")}.font(.caption).foregroundStyle(.secondary)
      } else {Text("Service status unavailable").font(.caption).foregroundStyle(.secondary)}
      HStack(spacing:18) {
        gateButton
        .disabled(entry.expired || entry.snapshot.phase == "unavailable")
        Link("Details",destination:URL(string:"smart-record-control://panel")!)
      }.font(.subheadline.bold())
      Text(ControlMailbox.feedback() ?? (entry.snapshot.phase == "draining" ? "Finishing current work safely…" : (entry.snapshot.paused ? "New work waits until you resume." : "Pause lets current work finish safely.")))
        .font(.caption2).foregroundStyle(.secondary).lineLimit(2)
    }.containerBackground(.fill.tertiary,for:.widget)
  }
}
@main
struct SmartRecordWidget:Widget {
  var body:some WidgetConfiguration {
    StaticConfiguration(kind:WidgetBridge.kind,provider:ProductionProvider()){ProductionView(entry:$0)}
      .configurationDisplayName("Smart Record")
      .description("Recording state and cooperative global Pause/Resume.")
      .supportedFamilies([.systemMedium])
  }
}
