import AVFoundation
import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Watches frames while recording and notes when the picture changes, so an
/// agent can review a recording without watching it. Reads a 24×24 grid from
/// the luma plane plus 12×12 from the colour plane (about 900 reads per frame,
/// no conversion), so equal-brightness colour changes count too.
final class ActivityTracker {
  static let grid = 24
  /// Mean absolute change (0–255 scale) that counts as a new scene. Static
  /// content sends no frames; cursor blinks and spinners score under 1.
  static let keyThreshold = 3.0
  static let minKeyGap = 0.75
  static let maxKeys = 60

  private var last: [Double]?
  private var lastKey: [Double]?
  private var lastKeyT = -10.0
  private(set) var keys: [(t: Double, score: Double)] = []
  /// Strongest frame-to-frame change in each second of the video.
  private(set) var perSecond: [Int: Double] = [:]

  func observe(_ pb: CVPixelBuffer, t: Double) {
    guard let g = Self.sample(pb) else { return }
    if let prev = last {
      let d = Self.diff(prev, g)
      let s = Int(t)
      perSecond[s] = max(perSecond[s] ?? 0, d)
    }
    last = g
    let k = lastKey.map { Self.diff($0, g) } ?? 0
    if lastKey == nil {
      lastKey = g
      lastKeyT = t
    } else if k >= Self.keyThreshold && t - lastKeyT >= Self.minKeyGap && keys.count < Self.maxKeys {
      keys.append((t, k))
      lastKey = g
      lastKeyT = t
    }
  }

  /// Seconds 0…n with their activity, rounded; quiet seconds are 0.
  func timeline(duration: Double) -> [Double] {
    (0..<max(1, Int(duration.rounded(.up)))).map { ((perSecond[$0] ?? 0) * 10).rounded() / 10 }
  }

  private static func sample(_ pb: CVPixelBuffer) -> [Double]? {
    guard CVPixelBufferGetPlaneCount(pb) >= 2, CVPixelBufferLockBaseAddress(pb, .readOnly) == kCVReturnSuccess else { return nil }
    defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
    var out: [Double] = []
    out.reserveCapacity(grid * grid + (grid / 2) * (grid / 2) * 2)
    // Plane 0: luma, one byte per pixel. Plane 1: interleaved Cb/Cr at half size.
    for (plane, n, channels) in [(0, grid, 1), (1, grid / 2, 2)] {
      guard let base = CVPixelBufferGetBaseAddressOfPlane(pb, plane) else { return nil }
      let w = CVPixelBufferGetWidthOfPlane(pb, plane), h = CVPixelBufferGetHeightOfPlane(pb, plane)
      let bpr = CVPixelBufferGetBytesPerRowOfPlane(pb, plane)
      let p = base.assumingMemoryBound(to: UInt8.self)
      for gy in 0..<n {
        let y = min(h - 1, (gy * 2 + 1) * h / (n * 2))
        for gx in 0..<n {
          let x = min(w - 1, (gx * 2 + 1) * w / (n * 2))
          for c in 0..<channels { out.append(Double(p[y * bpr + x * channels + c])) }
        }
      }
    }
    return out
  }

  private static func diff(_ a: [Double], _ b: [Double]) -> Double {
    var s = 0.0
    for i in a.indices { s += abs(a[i] - b[i]) }
    return s / Double(a.count)
  }
}

/// Review artifacts for a finished recording, written next to the video:
///   review/keyframe-<t>.jpg   start, every mark, every scene change, end
///   review/contact.jpg        up to 12 of those on one sheet, labelled
///   review/poster.jpg         the last frame (the end state)
enum Review {
  struct Key {
    let t: Double
    let reason: String  // start | mark | change | end | even
    let label: String?
  }

  static func make(video: String, dir: String, keys inKeys: [Key]) async throws -> [String: Any] {
    let asset = AVURLAsset(url: URL(fileURLWithPath: video))
    let duration = try await asset.load(.duration).seconds
    guard duration.isFinite, duration > 0 else { throw RPCError(code: "no_video", message: "video has no duration") }
    let reviewDir = dir + "/review"
    try? FileManager.default.removeItem(atPath: reviewDir)
    try FileManager.default.createDirectory(atPath: reviewDir, withIntermediateDirectories: true)

    // Start, marks and changes, end; drop near-duplicates (marks win).
    var keys = [Key(t: 0, reason: "start", label: nil)] + inKeys + [Key(t: max(0, duration - 0.05), reason: "end", label: nil)]
    if inKeys.isEmpty && duration > 6 {  // a static video: still give a few evenly spaced frames
      keys += (1..<4).map { Key(t: duration * Double($0) / 4, reason: "even", label: nil) }
    }
    keys.sort { $0.t < $1.t }
    var picked: [Key] = []
    for k in keys {
      if let last = picked.last, k.t - last.t < 0.3 {
        if k.reason == "mark" && last.reason != "mark" { picked[picked.count - 1] = k }
        continue
      }
      picked.append(k)
    }

    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.requestedTimeToleranceBefore = .zero
    gen.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 30)
    gen.maximumSize = CGSize(width: 1280, height: 1280)

    var frames: [[String: Any]] = []
    var images: [(CGImage, Key)] = []
    for k in picked {
      // A change is timed by the frame that showed it; ask a hair later so
      // rounding never lands on the frame before.
      let t = min(max(0, k.t + (k.reason == "change" ? 0.004 : 0)), max(0, duration - 0.02))
      guard let (img, _) = try? await gen.image(at: CMTime(seconds: t, preferredTimescale: 1_000_000)) else { continue }
      let path = String(format: "%@/keyframe-%07.3f.jpg", reviewDir, k.t)
      _ = try? ImageOut.write(img, to: path, format: "jpeg", quality: 0.8)
      var f: [String: Any] = ["t_s": (k.t * 1000).rounded() / 1000, "reason": k.reason, "path": path]
      if let l = k.label { f["label"] = l }
      frames.append(f)
      images.append((img, k))
    }
    guard let last = images.last else { throw RPCError(code: "no_frames", message: "could not read frames from the video") }
    let poster = reviewDir + "/poster.jpg"
    _ = try? ImageOut.write(last.0, to: poster, format: "jpeg", quality: 0.85)
    let contact = reviewDir + "/contact.jpg"
    if let sheet = contactSheet(choose(images, max: 12)) {
      _ = try? ImageOut.write(sheet, to: contact, format: "jpeg", quality: 0.8)
    }
    return ["duration_s": (duration * 1000).rounded() / 1000, "keyframes": frames, "contact_sheet": contact, "poster": poster, "dir": reviewDir]
  }

  /// Frames at specific times, for "show me 12.5 s".
  static func frames(video: String, at times: [Double], outDir: String, maxWidth: Int?) async throws -> [[String: Any]] {
    let asset = AVURLAsset(url: URL(fileURLWithPath: video))
    let duration = try await asset.load(.duration).seconds
    try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.requestedTimeToleranceBefore = .zero
    gen.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 60)
    if let m = maxWidth { gen.maximumSize = CGSize(width: m, height: m * 4) }
    var out: [[String: Any]] = []
    for t in times {
      let tt = min(max(0, t), max(0, duration - 0.02))
      let (img, actual) = try await gen.image(at: CMTime(seconds: tt, preferredTimescale: 600))
      let path = String(format: "%@/at-%07.3f.jpg", outDir, tt)
      _ = try ImageOut.write(img, to: path, format: "jpeg", quality: 0.8)
      out.append(["t_s": tt, "frame_t_s": (actual.seconds * 1000).rounded() / 1000,
                  "frame_time": ["value": String(actual.value), "timescale": actual.timescale],
                  "path": path, "w": img.width, "h": img.height,
                  "pixel_checks": ImageOut.stats(img),
                  "pixel_checks_qualification": "Coarse32x32 decoded-image uniformity before JPEG encoding, after requested preview scaling. A legitimate dark/empty scene can look blank; this does not identify the target, prove missing content, calibrate color or qualify unsampled frames. frame_time is the returned decoder image time, not an exact source-journal join."])
    }
    return out
  }

  /// Keeps start, end and marks; fills the rest evenly from the changes.
  private static func choose(_ all: [(CGImage, Key)], max n: Int) -> [(CGImage, Key)] {
    guard all.count > n else { return all }
    let must = all.enumerated().filter { ["start", "end", "mark"].contains($0.element.1.reason) }.map(\.offset)
    let rest = all.indices.filter { !must.contains($0) }
    let room = max(0, n - must.count)
    let step = Double(rest.count) / Double(max(1, room))
    let fill = room == 0 ? [] : (0..<room).map { rest[min(rest.count - 1, Int(Double($0) * step))] }
    return Set(must.prefix(n) + fill).sorted().map { all[$0] }
  }

  private static func contactSheet(_ tiles: [(CGImage, Key)]) -> CGImage? {
    guard let first = tiles.first?.0 else { return nil }
    let cols = min(4, tiles.count)
    let rows = (tiles.count + cols - 1) / cols
    let tileW = 320, tileH = max(1, Int(Double(tileW) * Double(first.height) / Double(first.width)))
    let label = 22, pad = 6
    let W = cols * (tileW + pad) + pad, H = rows * (tileH + label + pad) + pad
    guard let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else { return nil }
    ctx.setFillColor(CGColor(red: 0.09, green: 0.11, blue: 0.14, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    ctx.interpolationQuality = .high
    let font = CTFontCreateWithName("HelveticaNeue-Medium" as CFString, 12, nil)
    for (i, (img, key)) in tiles.enumerated() {
      let col = i % cols, row = i / cols
      let x = pad + col * (tileW + pad)
      let yTop = pad + row * (tileH + label + pad)  // from the top
      let y = H - yTop - tileH  // CG origin is bottom-left
      ctx.draw(img, in: CGRect(x: x, y: y, width: tileW, height: tileH))
      var text = String(format: "%.2fs", key.t)
      switch key.reason {
      case "mark": text += "  ◆ " + (key.label ?? "mark")
      case "start", "end": text += "  " + key.reason
      default: break
      }
      let color = key.reason == "mark" ? CGColor(red: 1, green: 0.62, blue: 0.3, alpha: 1) : CGColor(red: 0.85, green: 0.88, blue: 0.92, alpha: 1)
      let attrs = [kCTFontAttributeName: font, kCTForegroundColorAttributeName: color] as CFDictionary
      let line = CTLineCreateWithAttributedString(CFAttributedStringCreate(nil, text as CFString, attrs))
      ctx.saveGState()
      ctx.clip(to: CGRect(x: x, y: y - label, width: tileW, height: label))
      ctx.textPosition = CGPoint(x: Double(x + 4), y: Double(y - 16))
      CTLineDraw(line, ctx)
      ctx.restoreGState()
    }
    return ctx.makeImage()
  }
}
