import AppKit
import Foundation

guard CommandLine.arguments.count == 2 else {
    fputs("usage: clipboard.swift <output.png>\n", stderr)
    exit(2)
}
let pasteboard = NSPasteboard.general
guard let image = NSImage(pasteboard: pasteboard),
      let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("burst: clipboard has no readable image\n", stderr)
    exit(1)
}
do {
    try png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]), options: .atomic)
} catch {
    fputs("burst: could not save clipboard image: \(error)\n", stderr)
    exit(1)
}
