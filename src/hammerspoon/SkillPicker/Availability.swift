import AppKit

// Shared skills stay quiet; only a single-harness restriction needs a label.
struct Availability: Equatable {
    let harnesses: [String]
    var label: String {
        harnesses.map { $0 == "claude" ? "Claude" : $0 == "codex" ? "Codex" : $0 }.joined(separator: " and ")
    }
    var visibleLabel: String {
        let sources = Set(harnesses)
        if sources == ["claude", "codex"] { return "" }
        if sources == ["claude"] { return "Claude" }
        if sources == ["codex"] { return "Codex" }
        return "?"
    }
}

final class AvailabilityView: NSView {
    var availability = Availability(harnesses: [])
    override var isFlipped: Bool { true }
    private var attributes: [NSAttributedString.Key: Any] {
        [.font: NSFont.systemFont(ofSize: 11, weight: .medium),
         .foregroundColor: NSColor(calibratedWhite: 0.94, alpha: 0.72)]
    }
    var labelSize: NSSize { (availability.visibleLabel as NSString).size(withAttributes: attributes) }
    override func draw(_ dirtyRect: NSRect) {
        let text = availability.visibleLabel
        guard !text.isEmpty else { return }
        (text as NSString).draw(at: NSPoint(x: bounds.maxX - labelSize.width, y: bounds.midY - 7), withAttributes: attributes)
    }
}

// Tint is an additional cue only for Taylor's custom entry points. Labels and
// accessibility attribution remain the primary indication of availability.
struct SkillTint {
    enum Kind { case neutral, claude, codex }
    let kind: Kind
    init(name: String, harnesses: [String]) {
        let sources = Set(harnesses)
        if name.hasPrefix("taylor-") && sources == ["claude"] { kind = .claude }
        else if name.hasPrefix("taylor-") && sources == ["codex"] { kind = .codex }
        else { kind = .neutral }
    }
    var textColor: NSColor {
        let white = NSColor(srgbRed: 244.0/255, green: 244.0/255, blue: 245.0/255, alpha: 1)
        let base: NSColor
        switch kind {
        case .neutral: return white
        case .claude: base = NSColor(srgbRed: 217.0/255, green: 119.0/255, blue: 87.0/255, alpha: 1)
        case .codex: base = NSColor(srgbRed: 57.0/255, green: 131.0/255, blue: 247.0/255, alpha: 1)
        }
        return white.blended(withFraction: 0.30, of: base)!
    }
    var selectionColor: NSColor {
        kind == .neutral ? NSColor(calibratedWhite: 0.9, alpha: 0.14) : textColor.withAlphaComponent(0.09)
    }
}
