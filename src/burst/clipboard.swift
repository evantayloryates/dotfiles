import AppKit
import Foundation

guard (2...3).contains(CommandLine.arguments.count) else {
    fputs("usage: clipboard.swift <output.png> [pasteboard-name]\n", stderr)
    exit(2)
}
let pasteboard = CommandLine.arguments.count == 3
    ? NSPasteboard(name: NSPasteboard.Name(CommandLine.arguments[2]))
    : NSPasteboard.general
guard let image = NSImage(pasteboard: pasteboard),
      let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    exit(3) // No image is a normal text-only run.
}
do {
    try png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]), options: .atomic)
} catch {
    fputs("burst: could not save clipboard image: \(error)\n", stderr)
    exit(1)
}
