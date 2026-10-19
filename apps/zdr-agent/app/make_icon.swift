// Draws AppIcon.icns offline. Run once from this directory:
//   xcrun swift make_icon.swift && iconutil -c icns AppIcon.iconset && rm -rf AppIcon.iconset
import AppKit

func draw(size: CGFloat) -> NSBitmapImageRep {
    let pixels = Int(size)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = size / 1024

    // Squircle-ish background, inset like Apple's grid.
    let tile = NSRect(x: 100 * s, y: 100 * s, width: 824 * s, height: 824 * s)
    let background = NSBezierPath(roundedRect: tile, xRadius: 185 * s, yRadius: 185 * s)
    NSGradient(starting: NSColor(calibratedRed: 0.07, green: 0.20, blue: 0.24, alpha: 1),
               ending: NSColor(calibratedRed: 0.03, green: 0.09, blue: 0.12, alpha: 1))!
        .draw(in: background, angle: -90)

    // Shield.
    let shield = NSBezierPath()
    shield.move(to: NSPoint(x: 512 * s, y: 800 * s))
    shield.line(to: NSPoint(x: 740 * s, y: 720 * s))
    shield.curve(to: NSPoint(x: 512 * s, y: 215 * s), controlPoint1: NSPoint(x: 740 * s, y: 450 * s),
                 controlPoint2: NSPoint(x: 640 * s, y: 290 * s))
    shield.curve(to: NSPoint(x: 284 * s, y: 720 * s), controlPoint1: NSPoint(x: 384 * s, y: 290 * s),
                 controlPoint2: NSPoint(x: 284 * s, y: 450 * s))
    shield.close()
    NSColor(calibratedRed: 0.36, green: 0.85, blue: 0.72, alpha: 1).setFill()
    shield.fill()

    let text = NSAttributedString(string: "ZDR", attributes: [
        .font: NSFont.systemFont(ofSize: 150 * s, weight: .heavy),
        .foregroundColor: NSColor(calibratedRed: 0.03, green: 0.11, blue: 0.14, alpha: 1),
    ])
    let bounds = text.size()
    text.draw(at: NSPoint(x: 512 * s - bounds.width / 2, y: 505 * s - bounds.height / 2))

    NSGraphicsContext.restoreGraphicsState()
    return rep
}

let dir = URL(fileURLWithPath: "AppIcon.iconset", isDirectory: true)
try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let name = scale == 1 ? "icon_\(base)x\(base).png" : "icon_\(base)x\(base)@2x.png"
        let png = draw(size: CGFloat(base * scale)).representation(using: .png, properties: [:])!
        try! png.write(to: dir.appendingPathComponent(name))
    }
}
