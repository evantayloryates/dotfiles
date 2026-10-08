import Foundation

/// Exports carry their own media clock and a map to actual parent packets.
/// No new host epoch is invented; source geometry/input retain their parent.
enum Export {
  struct Plan {
    let format: String, effort: String, backend: String
    let fps: Int, maxWidth: Int?
    let from: Double, to: Double
    init(format: String, effort: String = "standard", backend: String? = nil,
         from: Double, to: Double, maxWidth: Double?, fps: Double?) throws {
      guard ["mp4", "gif"].contains(format), ["draft", "standard", "full"].contains(effort),
            from.isFinite, to.isFinite, from >= 0, to > from else {
        throw RPCError.badParams("export requires mp4/gif, draft/standard/full, and finite 0 <= from < to")
      }
      let rate = fps ?? (format == "gif" || effort == "draft" ? 12 : effort == "full" ? 60 : 30)
      guard rate.isFinite, rate.rounded() == rate, rate >= 1, rate <= (format == "gif" ? 50 : 120) else {
        throw RPCError.badParams("fps must be an integer from 1 to 120 (GIF: 1 to 50)")
      }
      if let width = maxWidth {
        guard width.isFinite, width.rounded() == width, width >= 64, width <= 8192 else {
          throw RPCError.badParams("max_width must be an integer from 64 to 8192")
        }
      }
      guard (to - from) * rate <= 120_000, to * rate < Double(Int64.max) / 2 else {
        throw RPCError.badParams("export exceeds the 120,000-frame mapping budget")
      }
      guard format != "gif" || to - from <= 60 else { throw RPCError.badParams("GIF exports are capped at 60 seconds") }
      let engine = backend ?? (format == "gif" || effort == "draft" ? "software" : "hardware")
      guard ["software", "hardware"].contains(engine) else { throw RPCError.badParams("backend must be software or hardware") }
      self.format = format; self.effort = effort; self.backend = engine
      self.from = from; self.to = to; self.fps = Int(rate)
      self.maxWidth = maxWidth.map(Int.init) ?? (effort == "draft" ? 640 : format == "gif" ? 960 : nil)
    }
    func tick(_ seconds: Double) throws -> Int64 {
      // JSON decimal boundaries such as 0.07 at 100 fps must stay on tick 7;
      // binary Double multiplication can produce 7.000000000000001 -> tick 8.
      guard let decimal = Decimal(string: String(seconds), locale: Locale(identifier: "en_US_POSIX")) else {
        throw RPCError.badParams("trim boundary is outside the decimal clock range")
      }
      var product = decimal * Decimal(fps), rounded = Decimal()
      NSDecimalRound(&rounded, &product, 0, .up)
      return NSDecimalNumber(decimal: rounded).int64Value
    }
    func filter(to end: Double) throws -> (String, Int64, Int64) {
      let first = try tick(from), last = try tick(end)
      guard last > first, last - first <= 120_000 else { throw RPCError.badParams("trim must contain 1–120,000 frames on the selected fps grid") }
      // Round transitions up: a future source frame cannot replace held content
      // before its original presentation time. Decode from zero to keep holds.
      let cut = "fps=fps=\(fps):start_time=0:round=up,trim=start_pts=\(first):end_pts=\(last),setpts=PTS-\(first)"
      let chain = ([cut] + (maxWidth.map { ["scale='min(\($0),iw)':-2:flags=lanczos"] } ?? [])).joined(separator: ",")
      return (chain, first, last)
    }
  }

  struct Packet { let pts: Int64, duration: Int64 }
  struct Media {
    let width: Int, height: Int, numerator: Int64, denominator: Int64
    let packets: [Packet]
    func seconds(_ pts: Int64) -> Double { Double(pts) * Double(numerator) / Double(denominator) }
    var end: Double { packets.map { seconds($0.pts + $0.duration) }.max() ?? 0 }
    func grid(_ pts: Int64, fps: Int) throws -> Int64 {
      let (a, o1) = pts.multipliedReportingOverflow(by: numerator)
      let (b, o2) = a.multipliedReportingOverflow(by: Int64(fps))
      guard !o1, !o2 else { throw RPCError(code: "export_mapping", message: "source clock exceeds exact mapping range") }
      return b / denominator + (b % denominator > 0 ? 1 : 0)
    }
  }

  static func binary(_ name: String) throws -> String {
    for root in ["/opt/homebrew/bin", "/usr/local/bin"] {
      let p = root + "/" + name
      if FileManager.default.isExecutableFile(atPath: p) { return p }
    }
    throw RPCError(code: "no_ffmpeg", message: "\(name) not found; install ffmpeg with Homebrew")
  }

  static func inspect(_ path: String) async throws -> Media {
    let result = try await ManagedCommand.run(try binary("ffprobe"),
      ["-v", "error", "-select_streams", "v:0", "-show_packets", "-show_streams", "-show_entries",
       "stream=width,height,time_base:packet=pts,duration", "-of", "json", path], timeout: 30, maxBytes: 16 * 1024 * 1024)
    guard result.status == 0,
          let value = try JSONSerialization.jsonObject(with: result.stdout) as? [String: Any],
          let stream = (value["streams"] as? [[String: Any]])?.first,
          let width = stream.num("width"), let height = stream.num("height"),
          width.isFinite, height.isFinite, width >= 1, height >= 1, width <= 32768, height <= 32768,
          width.rounded() == width, height.rounded() == height,
          let clock = stream.str("time_base")?.split(separator: "/"), clock.count == 2,
          let num = Int64(clock[0]), let den = Int64(clock[1]), num > 0, den > 0,
          let rows = value["packets"] as? [[String: Any]], !rows.isEmpty, rows.count <= 250_000 else {
      throw RPCError(code: "export_probe", message: "cannot establish bounded video packet coverage")
    }
    let packets = try rows.map { row -> Packet in
      guard let p = row["pts"] as? NSNumber, let d = row["duration"] as? NSNumber,
            p.doubleValue.isFinite, abs(p.doubleValue) < Double(Int64.max) / 2, p.doubleValue.rounded() == p.doubleValue,
            d.doubleValue.isFinite, d.doubleValue >= 1, d.doubleValue < Double(Int64.max) / 2, d.doubleValue.rounded() == d.doubleValue else {
        throw RPCError(code: "export_probe", message: "video packet has unknown presentation time/duration")
      }
      return Packet(pts: p.int64Value, duration: d.int64Value)
    }.sorted { $0.pts < $1.pts }
    guard Set(packets.map(\.pts)).count == packets.count else { throw RPCError(code: "export_probe", message: "duplicate video presentation timestamps") }
    return Media(width: Int(width), height: Int(height), numerator: num, denominator: den, packets: packets)
  }

  static func mapping(parent: Media, child: Media, first: Int64, last: Int64, fps: Int) throws -> [[String: Any]] {
    guard child.packets.count == Int(last - first) else {
      throw RPCError(code: "export_mapping", message: "export packet count differs from its sampling grid; output has no verified map")
    }
    let sourceTicks = try parent.packets.map { try parent.grid($0.pts, fps: fps) }
    var selected = 0, frames: [[String: Any]] = []
    for (i, packet) in child.packets.enumerated() {
      let nominal = first + Int64(i)
      while selected + 1 < sourceTicks.count && sourceTicks[selected + 1] <= nominal { selected += 1 }
      // GIF stores centiseconds; other containers have their own rational clock.
      let delta = abs(child.seconds(packet.pts) - Double(i) / Double(fps))
      guard delta <= child.seconds(1) + 1e-9 else {
        throw RPCError(code: "export_mapping", message: "export clock deviates from the verified sampling grid")
      }
      frames.append(["index": i, "pts": String(packet.pts), "duration": String(packet.duration),
                     "nominal_parent_tick": String(nominal), "parent_packet_index": selected,
                     "parent_pts": String(parent.packets[selected].pts),
                     "padded_before_first_source": sourceTicks[selected] > nominal])
    }
    return frames
  }

  static func run(video: String, out: String, format: String, from: Double, to: Double,
                  maxWidth: Double?, fps: Double?, effort: String = "standard", backend: String? = nil,
                  parentIdentity: [String: Any] = [:]) async throws -> [String: Any] {
    let plan = try Plan(format: format, effort: effort, backend: backend, from: from, to: to, maxWidth: maxWidth, fps: fps)
    let fm = FileManager.default, manifestPath = out + ".source.json"
    // Existing derivatives are immutable. A failed attempt cannot erase a
    // previously reviewed export; unique temporary files retain partial proof.
    func exists(_ path: String) -> Bool { var s = stat(); return lstat(path, &s) == 0 }
    guard !exists(out), !exists(manifestPath) else { throw RPCError.badParams("export name already exists; choose a new name") }
    try fm.createDirectory(atPath: (out as NSString).deletingLastPathComponent, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    let temporary = (out as NSString).deletingLastPathComponent + "/partial-" + UUID().uuidString + "." + format
    let parent = try await inspect(video)
    let end = min(to, parent.end)
    let (filter, first, last) = try plan.filter(to: end)
    var args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-copyts", "-threads", "2"]
    if plan.backend == "hardware" { args += ["-hwaccel", "videotoolbox"] }
    args += ["-i", video, "-map", "0:v:0", "-filter_threads", "2"]
    if format == "gif" {
      // The held-frame fixture lost its final color with stats_mode=diff on
      // the local ffmpeg build. Full histograms preserve that content change.
      args += ["-vf", "\(filter),split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", temporary]
    } else {
      args += ["-vf", filter, "-fps_mode", "passthrough"]
      if plan.backend == "hardware" { args += ["-c:v", "h264_videotoolbox", "-q:v", effort == "full" ? "75" : "65"] }
      else { args += ["-c:v", "libx264", "-preset", effort == "draft" ? "ultrafast" : "veryfast", "-crf", effort == "draft" ? "28" : "20", "-threads", "2"] }
      args += ["-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", temporary]
    }
    let t0 = uptimeNs()
    let result: ManagedCommand.Output
    do { result = try await ManagedCommand.run(try binary("ffmpeg"), args, timeout: effort == "draft" ? 120 : 300) }
    catch { throw RPCError(code: (error as? RPCError)?.code ?? "export_failed", message: "\(error); partial output, if any: \(temporary)") }
    guard result.status == 0 else {
      let message = String(data: result.stderr, encoding: .utf8) ?? ""
      throw RPCError(code: "export_failed", message: "ffmpeg failed: \(message.prefix(400)); partial output: \(temporary)")
    }
    let child = try await inspect(temporary)
    let frames = try mapping(parent: parent, child: child, first: first, last: last, fps: plan.fps)
    let sx = Double(child.width) / Double(parent.width), sy = Double(child.height) / Double(parent.height)
    let manifest: [String: Any] = ["schema": "record-screen-derivative/v1", "video": out,
      "parent": parentIdentity.merging(["video": video], uniquingKeysWith: { _, b in b }),
      "effort": effort, "backend": plan.backend, "requested_interval_s": [from, to], "effective_end_s": end,
      "sampling": ["fps": plan.fps, "first_parent_tick": String(first), "end_parent_tick_exclusive": String(last), "transition_rounding": "up", "selection": "latest parent packet at or before the sample; first packet padding explicit"],
      "parent_time_base": [String(parent.numerator), String(parent.denominator)],
      "time_base": [String(child.numerator), String(child.denominator)], "frames": frames,
      "geometry": ["parent_pixels": [parent.width, parent.height], "pixels": [child.width, child.height], "parent_pixels_to_derivative_pixels": [sx, 0, 0, sy, 0, 0]],
      "limits": ["Media presentation mapping, not physical display latency", "Parent journal completeness and video outcome remain separate", "GIF viewer playback scheduling is not qualified", "No source geometry or raw pointer coordinates are newly qualified"]]
    guard let data = jsonData(manifest), data.count <= 32 * 1024 * 1024 else { throw RPCError(code: "export_mapping", message: "derivative manifest exceeds its bounded output") }
    try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: temporary)
    // A new name is published only after both media and mapping validate.
    try fm.moveItem(atPath: temporary, toPath: out)
    do { try data.write(to: URL(fileURLWithPath: manifestPath), options: .withoutOverwriting); try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: manifestPath) }
    catch { try? fm.moveItem(atPath: out, toPath: temporary); throw error }
    let bytes = (try? fm.attributesOfItem(atPath: out)[.size] as? Int) ?? 0
    return ["path": out, "format": format, "from_s": from, "to_s": to, "bytes": bytes, "ms": Double(uptimeNs() - t0) / 1e6,
            "derivative_source": ["schema": "record-screen-derivative/v1", "path": manifestPath, "frames": frames.count, "fps": plan.fps, "effort": effort, "backend": plan.backend,
                                  "first_parent_tick": String(first), "parent_time_base": [String(parent.numerator), String(parent.denominator)], "time_base": [String(child.numerator), String(child.denominator)], "pixels": [child.width, child.height]]]
  }
}
