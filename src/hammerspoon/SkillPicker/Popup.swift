import AppKit

struct InputCache {
    var text: String? = nil
    var until: TimeInterval = 0
    mutating func cancel(_ value: String, now: TimeInterval) { text = value; until = now + 150 }
    mutating func select() { text = nil; until = 0 }
    mutating func open(now: TimeInterval) -> String {
        if let text = text, now < until { return text }
        select(); return "taylor-"
    }
}

struct RefreshGate {
    var revision = 0
    var awaiting = false
    var confirmed = -1
    mutating func begin() { revision += 1; awaiting = true; confirmed = -1 }
    mutating func complete(_ id: Int) -> Bool {
        guard id == revision else { return false }
        awaiting = false; confirmed = id; return true
    }
    mutating func cancel() { awaiting = false; confirmed = -1 }
    var canSelect: Bool { !awaiting && confirmed == revision }
}

struct RefreshPresentation {
    var hasSnapshot = false
    var quiet = false
    var renderedError = false
    mutating func begin(background: Bool) {
        quiet = background && hasSnapshot
    }
    func needsCommit(current: [SkillRecord], next: [SkillRecord], error: Bool) -> Bool {
        if quiet && error { return false }
        return !hasSnapshot || current != next || renderedError != error
    }
    mutating func complete(error: Bool) {
        if quiet && error { return }
        hasSnapshot = true; renderedError = error
    }
    mutating func reset() { hasSnapshot = false; quiet = false; renderedError = false }
}

func runModelRegression() {
    var cache = InputCache()
    precondition(cache.open(now: 0) == "taylor-")
    cache.cancel("", now: 10); precondition(cache.open(now: 159) == "")
    precondition(cache.open(now: 160) == "taylor-")
    cache.cancel("pr review", now: 200); precondition(cache.open(now: 230) == "pr review")
    cache.select(); precondition(cache.open(now: 231) == "taylor-")
    cache.cancel("taylor-code", now: 250); precondition(cache.open(now: 400) == "taylor-")
    var gate = RefreshGate()
    precondition(!gate.canSelect)
    gate.begin(); precondition(!gate.canSelect)
    precondition(!gate.complete(0)); precondition(gate.awaiting)
    gate.begin(); precondition(!gate.complete(1)); precondition(!gate.canSelect)
    precondition(gate.complete(2)); precondition(gate.canSelect)
    gate.begin(); precondition(!gate.canSelect); gate.cancel(); precondition(!gate.canSelect)
    gate.begin(); precondition(!gate.complete(3)); precondition(gate.complete(4))
    var presentation = RefreshPresentation()
    let rows = [SkillRecord(name: "taylor-codebot", path: "/skills/codebot/SKILL.md")]
    presentation.begin(background: true); precondition(!presentation.quiet)
    precondition(presentation.needsCommit(current: [], next: rows, error: false))
    presentation.complete(error: false); presentation.begin(background: true)
    precondition(presentation.quiet)
    for _ in 0..<1000 {
        precondition(!presentation.needsCommit(current: rows, next: rows, error: false))
        precondition(!presentation.needsCommit(current: rows, next: [], error: true))
    }
    precondition(presentation.needsCommit(current: rows, next: [], error: false))
    precondition(presentation.needsCommit(current: [], next: rows, error: false))
    presentation.begin(background: false); precondition(!presentation.quiet)
    precondition(!presentation.needsCommit(current: rows, next: rows, error: false))
    precondition(!presentation.needsCommit(current: [], next: [], error: false))
    presentation.reset(); precondition(!presentation.hasSnapshot)
    presentation.complete(error: true); precondition(presentation.hasSnapshot)
    presentation.begin(background: false)
    precondition(!presentation.needsCommit(current: [], next: [], error: true))
    precondition(presentation.needsCommit(current: [], next: [], error: false))
    print("Input cache: 6 cases; refresh gate: 12 assertions; presentation: 1000 stable/error refresh pairs and foreground/change checks passed")
    exit(0)
}

func emit(_ value: [String: Any]) {
    if CommandLine.arguments.contains("--ui-self-test") { return }
    guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
    FileHandle.standardOutput.write(data + Data([10]))
}

final class GlassPanel: NSPanel {
    var escape: (() -> Void)?
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
    override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown && event.keyCode == 53 { escape?(); return }
        super.sendEvent(event)
    }
}

final class GlassRoot: NSVisualEffectView {
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let shape = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: 22, yRadius: 22)
        NSColor(calibratedWhite: 0.97, alpha: 0.16).setStroke()
        shape.lineWidth = 1; shape.stroke()
    }
}

final class ZincRow: NSTableRowView {
    var selectionWidth: CGFloat = 0
    var selectionColor = NSColor(calibratedWhite: 0.9, alpha: 0.14)
    override func drawSelection(in dirtyRect: NSRect) {
        if isSelected {
            selectionColor.setFill()
            NSBezierPath(roundedRect: NSRect(x: 8, y: (bounds.height - 28)/2, width: selectionWidth, height: 28), xRadius: 7, yRadius: 7).fill()
        }
    }
}

final class Popup: NSObject, NSApplicationDelegate, NSTableViewDataSource, NSTableViewDelegate, NSTextFieldDelegate, NSWindowDelegate {
    let panel = GlassPanel(contentRect: NSRect(x: 0, y: 0, width: 396, height: 420),
                          styleMask: [.borderless], backing: .buffered, defer: false)
    let search = SearchField()
    let searchEditor = SearchFieldEditor()
    let separator = NSBox()
    let table = NSTableView()
    let scroll = NSScrollView()
    let spinner = NSProgressIndicator()
    let stateLabel = NSTextField(labelWithString: "")
    var skills: [SkillRecord] = []
    var cache = InputCache()
    var normalizingInput = false
    var gate = RefreshGate()
    var presentation = RefreshPresentation()
    var tableReloads = 0
    var quietCompletions = 0
    var revision: Int { gate.revision }
    var awaiting: Bool { gate.awaiting }
    var visible = false
    var cadence: Timer?
    var spinnerDelay: Timer?
    var cacheExpiry: Timer?
    var monitors: [Any] = []
    var openedAt: TimeInterval = 0
    var refreshedAt: TimeInterval = 0
    var firstResultsReported = false
    var selectedPath: String? = nil
    var scrollOrigin = NSPoint.zero

    func applicationDidFinishLaunching(_ notification: Notification) {
        panel.title = "Skill Picker"
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.hidesOnDeactivate = false; panel.isReleasedWhenClosed = false
        panel.animationBehavior = .none
        panel.delegate = self
        panel.appearance = NSAppearance(named: .darkAqua)
        panel.escape = { [weak self] in self?.close("escape") }
        let glass = GlassRoot()
        glass.material = .hudWindow; glass.blendingMode = .behindWindow; glass.state = .active
        glass.wantsLayer = true; glass.layer?.cornerRadius = 22; glass.layer?.masksToBounds = true
        glass.layer?.borderColor = NSColor(calibratedWhite: 1, alpha: 0.16).cgColor; glass.layer?.borderWidth = 0.7
        panel.contentView = glass
        let tint = NSView()
        tint.wantsLayer = true; tint.layer?.backgroundColor = NSColor(calibratedRed: 0.085, green: 0.085, blue: 0.095, alpha: 0.82).cgColor
        tint.translatesAutoresizingMaskIntoConstraints = false
        glass.addSubview(tint)
        NSLayoutConstraint.activate([tint.leadingAnchor.constraint(equalTo: glass.leadingAnchor), tint.trailingAnchor.constraint(equalTo: glass.trailingAnchor), tint.topAnchor.constraint(equalTo: glass.topAnchor), tint.bottomAnchor.constraint(equalTo: glass.bottomAnchor)])
        search.font = .systemFont(ofSize: 22, weight: .regular)
        search.textColor = NSColor(calibratedWhite: 0.95, alpha: 1)
        search.isBordered = false; search.drawsBackground = false; search.focusRingType = .none
        search.placeholderString = "Find a skill"; search.delegate = self
        search.cell?.usesSingleLineMode = true
        searchEditor.isFieldEditor = true; searchEditor.isRichText = false
        searchEditor.importsGraphics = false; searchEditor.allowsUndo = true
        search.setAccessibilityLabel("Find a skill")
        separator.boxType = .separator
        table.addTableColumn(NSTableColumn(identifier: NSUserInterfaceItemIdentifier("skill")))
        table.headerView = nil; table.backgroundColor = .clear; table.style = .plain
        table.dataSource = self; table.delegate = self
        table.rowHeight = 35; table.intercellSpacing = NSSize(width: 0, height: 0)
        table.selectionHighlightStyle = .regular
        table.target = self; table.action = #selector(choose)
        table.setAccessibilityLabel("Skills")
        scroll.documentView = table; scroll.drawsBackground = false
        scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true
        spinner.style = .spinning; spinner.controlSize = .small
        spinner.isDisplayedWhenStopped = false
        stateLabel.font = .systemFont(ofSize: 14); stateLabel.textColor = NSColor(calibratedWhite: 0.68, alpha: 1)
        stateLabel.isHidden = true
        for view in [search, separator, scroll, spinner, stateLabel] {
            view.translatesAutoresizingMaskIntoConstraints = false; glass.addSubview(view)
        }
        NSLayoutConstraint.activate([
            search.leadingAnchor.constraint(equalTo: glass.leadingAnchor, constant: 24), search.trailingAnchor.constraint(equalTo: glass.trailingAnchor, constant: -52), search.topAnchor.constraint(equalTo: glass.topAnchor, constant: 18), search.heightAnchor.constraint(equalToConstant: 30),
            separator.topAnchor.constraint(equalTo: glass.topAnchor, constant: 58), separator.leadingAnchor.constraint(equalTo: glass.leadingAnchor, constant: 16), separator.trailingAnchor.constraint(equalTo: glass.trailingAnchor, constant: -16),
            scroll.topAnchor.constraint(equalTo: separator.bottomAnchor, constant: 7), scroll.leadingAnchor.constraint(equalTo: glass.leadingAnchor, constant: 8), scroll.trailingAnchor.constraint(equalTo: glass.trailingAnchor, constant: -8), scroll.bottomAnchor.constraint(equalTo: glass.bottomAnchor, constant: -10),
            spinner.centerYAnchor.constraint(equalTo: search.centerYAnchor), spinner.trailingAnchor.constraint(equalTo: glass.trailingAnchor, constant: -20), spinner.widthAnchor.constraint(equalToConstant: 16), spinner.heightAnchor.constraint(equalToConstant: 16),
            stateLabel.topAnchor.constraint(equalTo: separator.bottomAnchor, constant: 24), stateLabel.leadingAnchor.constraint(equalTo: glass.leadingAnchor, constant: 24), stateLabel.trailingAnchor.constraint(equalTo: glass.trailingAnchor, constant: -24)
        ])
        glass.layoutSubtreeIfNeeded()
        if CommandLine.arguments.contains("--ui-self-test") {
            runRenderRegression()
            exit(0)
        }
        panel.makeFirstResponder(search)
        // Preload event monitors once; re-registering them on every opening
        // adds a noticeable delay. Hidden-state callbacks return immediately.
        if let global = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown], handler: { [weak self] event in
            guard let self = self, self.visible, event.timestamp >= self.openedAt else { return }
            self.close("outside")
        }) { monitors.append(global) }
        if let local = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown], handler: { [weak self] event in
            guard let self = self, self.visible, event.timestamp >= self.openedAt else { return event }
            if event.window !== self.panel { self.close("outside") }
            return event
        }) { monitors.append(local) }
        DispatchQueue.global(qos: .utility).async { [weak self] in
            while let line = readLine() {
                guard let data = line.data(using: .utf8), let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
                DispatchQueue.main.async { self?.handle(message) }
            }
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
        emit(["action": "ready", "reduce_transparency": NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency])
    }

    func runRenderRegression() {
        // Exercise native plain-text clipboard insertion without touching the
        // user's clipboard or displaying a test window on the shared desktop.
        let pasteboard = NSPasteboard.withUniqueName()
        defer { pasteboard.releaseGlobally() }
        let editor = panel.fieldEditor(true, for: search) as! NSTextView
        for payload in ["audio-ingest", "café-☕", "audio\ningest", String(repeating: "x", count: 4096)] {
            pasteboard.clearContents(); precondition(pasteboard.setString(payload, forType: .string))
            editor.string = "taylor-"
            editor.setSelectedRange(NSRange(location: 7, length: 0))
            precondition(editor.readSelection(from: pasteboard, type: .string))
            precondition(editor.string == SearchInput.normalize("taylor-" + payload).text)
            editor.setSelectedRange(NSRange(location: 0, length: editor.string.utf16.count))
            pasteboard.clearContents(); precondition(pasteboard.setString("taylor-codebot", forType: .string))
            precondition(editor.readSelection(from: pasteboard, type: .string))
            precondition(editor.string == "taylor-codebot")
        }
        pasteboard.clearContents(); editor.string = "taylor-"
        precondition(!editor.readSelection(from: pasteboard, type: .string))
        precondition(editor.string == "taylor-")
        let rich = NSAttributedString(string: "left\n \nright")
        let richData = try! rich.data(from: NSRange(location: 0, length: rich.length), documentAttributes: [.documentType: NSAttributedString.DocumentType.rtf])
        pasteboard.clearContents(); precondition(pasteboard.setData(richData, forType: .rtf))
        editor.string = ""; editor.setSelectedRange(NSRange(location: 0, length: 0))
        precondition(editor.readSelection(from: pasteboard, type: .rtf))
        precondition(editor.string == "left right")
        runFieldEditorRegression()
        search.stringValue = "alpha\n \n beta"
        precondition(search.stringValue == "alpha beta")
        print("Native paste: append/replacement, Unicode, multiline, 4096 characters, empty clipboard; private pasteboard only")
        // Use the actual field/editor delegate connection, still offscreen.
        search.stringValue = "taylor-"
        precondition(panel.makeFirstResponder(search))
        let connected = search.currentEditor() as! SearchFieldEditor
        connected.setSelectedRange(NSRange(location: 0, length: connected.string.utf16.count))
        pasteboard.clearContents(); pasteboard.setString("hello\r\n \n\t there", forType: .string)
        precondition(connected.readSelection(from: pasteboard, type: .string))
        precondition(connected.string == "hello there" && search.stringValue == "hello there")
        search.stringValue = "alpha\n \n beta"
        precondition(search.stringValue == "alpha beta")
        print("Connected field: mixed-break paste and programmatic single-line value passed")
        // Exercise the real AppKit commit path without showing a window or
        // installing event monitors on the shared desktop.
        visible = true; firstResultsReported = true
        let rows = [
            SkillRecord(name: "taylor-codebot", path: "/skills/codebot/SKILL.md"),
            SkillRecord(name: "taylor-pr-review", path: "/skills/review/SKILL.md")
        ]
        gate.begin(); presentation.begin(background: false)
        handle(["action":"results", "id":revision, "skills":rows.map { $0.wire }])
        table.selectRowIndexes(IndexSet(integer: 1), byExtendingSelection: false)
        let cell = table.view(atColumn: 0, row: 0, makeIfNecessary: true)
        let origin = scroll.contentView.bounds.origin
        let reloads = tableReloads
        for _ in 0..<1000 {
            for error in [false, true] {
                refresh(background: true)
                precondition(!scroll.isHidden && stateLabel.isHidden)
                precondition(spinnerDelay == nil && skills == rows)
                handle(["action":"results", "id":revision, "skills":error ? [] : rows.map { $0.wire }, "error":error])
                precondition(tableReloads == reloads && skills == rows)
                precondition(!scroll.isHidden && stateLabel.isHidden)
                precondition(table.selectedRow == 1 && scroll.contentView.bounds.origin == origin)
                precondition(table.view(atColumn: 0, row: 0, makeIfNecessary: true) === cell)
            }
        }
        // A real catalog change updates once, preserving the selected file.
        refresh(background: true)
        handle(["action":"results", "id":revision, "skills":[rows[1].wire]])
        precondition(tableReloads == reloads + 1 && table.selectedRow == 0 && !scroll.isHidden)
        refresh(background: true)
        handle(["action":"results", "id":revision, "skills":[]])
        precondition(tableReloads == reloads + 2 && scroll.isHidden && !stateLabel.isHidden)
        refresh(background: true)
        handle(["action":"results", "id":revision, "skills":[]])
        precondition(tableReloads == reloads + 2)
        // Repeated bogus keystrokes keep the SAME empty view even while each
        // new filter request is pending; no hide/show or redundant reload.
        let emptyReloads = tableReloads
        let emptyLabel = stateLabel.stringValue
        let emptyFrame = stateLabel.frame
        for _ in 0..<1000 {
            search.stringValue += "l"
            controlTextDidChange(Notification(name: Notification.Name("regression"), object: search))
            precondition(scroll.isHidden && !stateLabel.isHidden && !gate.canSelect)
            precondition(stateLabel.stringValue == emptyLabel && stateLabel.frame == emptyFrame)
            handle(["action":"results", "id":revision, "skills":[]])
            precondition(tableReloads == emptyReloads && !stateLabel.isHidden)
            precondition(stateLabel.stringValue == emptyLabel && stateLabel.frame == emptyFrame)
        }
        // A genuinely different result commits once, then repeated filters
        // with the same rows leave the cell, selection and scroll untouched.
        refresh(resetSelection: true)
        precondition(scroll.isHidden && !stateLabel.isHidden && spinnerDelay != nil)
        handle(["action":"results", "id":revision, "skills":rows.map { $0.wire }])
        precondition(!scroll.isHidden && gate.canSelect)
        let foregroundReloads = tableReloads
        let foregroundCell = table.view(atColumn: 0, row: 0, makeIfNecessary: true)
        precondition(foregroundCell != nil)
        for _ in 0..<1000 {
            refresh(resetSelection: true)
            precondition(!scroll.isHidden && stateLabel.isHidden && !gate.canSelect)
            handle(["action":"results", "id":revision, "skills":rows.map { $0.wire }])
            precondition(tableReloads == foregroundReloads)
            precondition(table.view(atColumn: 0, row: 0, makeIfNecessary: true) === foregroundCell)
        }
        let retainedCell = table.view(atColumn: 0, row: 0, makeIfNecessary: true)
        panel.contentView?.layoutSubtreeIfNeeded(); retainedCell?.layoutSubtreeIfNeeded()
        let selectedRow = table.rowView(atRow: table.selectedRow, makeIfNecessary: true) as! ZincRow
        let selectedCell = table.view(atColumn: 0, row: table.selectedRow, makeIfNecessary: true) as! NSTableCellView
        selectedCell.layoutSubtreeIfNeeded()
        precondition(selectedCell.frame.minX == 0)
        precondition(abs(selectedCell.textField!.frame.minX - 12) < 0.1)
        precondition(selectedRow.selectionWidth < table.bounds.width - 60)
        print("Selection geometry: plain cells; text glyph inset 14, selection inset 8, six-point horizontal padding")
        // The committed presentation has no candidate state or key interception.
        precondition(panel.frame.width == 396)
        let root = panel.contentView!
        let separatorAlignment = separator.alignmentRect(forFrame: separator.frame)
        let separatorTop = root.isFlipped ? separatorAlignment.minY : root.bounds.height - separatorAlignment.maxY
        precondition(abs(separatorTop - 58) < 0.1)
        precondition(separator.frame.minX == 16)
        let states: [([String], String)] = [
            (["claude"], "Claude"), (["codex"], "Codex"),
            (["claude", "codex"], ""), (["third"], "?"),
            (["claude", "third"], "?"), ([], "?")
        ]
        let drawing = AvailabilityView(frame: NSRect(x: 0, y: 0, width: 54, height: 35))
        let canvas = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 54, pixelsHigh: 35, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: canvas)
        for (harnesses, label) in states {
            drawing.availability = Availability(harnesses: harnesses)
            precondition(drawing.availability.visibleLabel == label)
            precondition(drawing.labelSize.width <= drawing.bounds.width)
            drawing.draw(drawing.bounds)
        }
        NSGraphicsContext.restoreGraphicsState()
        let mark = selectedCell.subviews.first { $0 is AvailabilityView }!
        precondition(mark.frame.width == 54)
        precondition(selectedCell.textField!.frame.maxX <= mark.frame.minX - 8)
        precondition(SkillTint(name: "taylor-demo", harnesses: ["claude"]).kind == .claude)
        precondition(SkillTint(name: "taylor-demo", harnesses: ["codex"]).kind == .codex)
        for sources in [["claude", "codex"], ["claude", "third"], []] {
            precondition(SkillTint(name: "taylor-demo", harnesses: sources).kind == .neutral)
        }
        precondition(SkillTint(name: "external", harnesses: ["claude"]).kind == .neutral)
        precondition(SkillTint(name: "external", harnesses: ["codex"]).kind == .neutral)
        let neutral = SkillTint(name: "taylor-demo", harnesses: ["claude", "codex"])
        for sources in [["claude"], ["codex"]] {
            let tint = SkillTint(name: "taylor-demo", harnesses: sources)
            precondition(tint.selectionColor.alphaComponent < neutral.selectionColor.alphaComponent)
        }
        print("Taylor tint: prefix-only, exclusive-only; shared/unknown/external neutral and exclusive frames darker")
        print("Production geometry: 396 px window, separator top 58, full harness labels; six availability states passed")
        print("AppKit: 2000 background refreshes, 1000 bogus empty-result keystrokes and 1000 identical-result filter changes passed; stable visibility, label, layout and cell identity")
    }

    func handle(_ message: [String: Any]) {
        switch message["action"] as? String {
        case "show":
            let frame = message["frame"] as? [String: Double] ?? [:]
            let primaryTop = NSScreen.screens.first?.frame.maxY ?? 0
            let rect = NSRect(x: frame["x"] ?? 0, y: primaryTop - (frame["y"] ?? 0) - (frame["h"] ?? 420), width: frame["w"] ?? 396, height: frame["h"] ?? 420)
            show(rect)
        case "hide": close(message["reason"] as? String ?? "shortcut")
        case "results":
            guard visible, let id = message["id"] as? Int, gate.complete(id) else { return }
            let error = message["error"] as? Bool == true
            let next = SkillRecord.parse(message["skills"])
            let commit = presentation.needsCommit(current: skills, next: next, error: error)
            if presentation.quiet {
                quietCompletions += 1
                if error { gate.cancel() }
                // Capture at commit time: background work must not rewind any
                // scrolling or selection performed while the reader was busy.
                selectedPath = skills.indices.contains(table.selectedRow) ? skills[table.selectedRow].id : nil
                scrollOrigin = scroll.contentView.bounds.origin
            } else {
                spinnerDelay?.invalidate(); spinnerDelay = nil; spinner.stopAnimation(nil)
            }
            if commit {
                // One main-thread transaction; keep the existing view until
                // a genuinely different result or status is confirmed.
                CATransaction.begin(); CATransaction.setDisableActions(true)
                NSAnimationContext.runAnimationGroup { context in
                    context.duration = 0; context.allowsImplicitAnimation = false
                    skills = next
                    table.reloadData(); tableReloads += 1
                    scroll.isHidden = skills.isEmpty
                    if !skills.isEmpty {
                        let index = skills.firstIndex { $0.id == selectedPath } ?? 0
                        table.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false)
                        scroll.contentView.scroll(to: scrollOrigin); scroll.reflectScrolledClipView(scroll.contentView)
                    }
                    stateLabel.stringValue = error ? "Skills unavailable. Retrying automatically…" : "No matching skills"
                    stateLabel.isHidden = !skills.isEmpty
                }
                CATransaction.commit()
                panel.contentView?.displayIfNeeded()
            }
            presentation.complete(error: error)
            var timing: [String: Any] = ["action":"painted", "id":id, "ui_changed":commit, "table_reloads":tableReloads, "quiet_completions":quietCompletions, "refresh_paint_ms":(ProcessInfo.processInfo.systemUptime - refreshedAt)*1000]
            if !firstResultsReported { timing["first_results_ms"] = (ProcessInfo.processInfo.systemUptime - openedAt)*1000; firstResultsReported = true }
            emit(timing)
        case "quit": NSApp.terminate(nil)
        default: break
        }
    }

    func show(_ rect: NSRect) {
        guard !visible else { close("shortcut"); return }
        openedAt = ProcessInfo.processInfo.systemUptime
        firstResultsReported = false
        presentation.reset()
        visible = true
        panel.setFrame(rect, display: false)
        search.stringValue = cache.open(now: openedAt)
        skills = []; table.reloadData(); scroll.isHidden = true; stateLabel.isHidden = true
        selectedPath = nil; scrollOrigin = .zero
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil); panel.makeFirstResponder(search)
        if let editor = search.currentEditor() { editor.selectedRange = NSRange(location: search.stringValue.utf16.count, length: 0) }
        panel.contentView?.displayIfNeeded()
        emit(["action":"shown", "first_paint_ms": (ProcessInfo.processInfo.systemUptime - openedAt)*1000])
        cadence = Timer(timeInterval: 3, repeats: true) { [weak self] _ in
            guard let self = self, !self.awaiting else { return }; self.refresh(background: true)
        }
        RunLoop.main.add(cadence!, forMode: .common)
        refresh()
    }

    func refresh(resetSelection: Bool = false, background: Bool = false) {
        guard visible, !searchEditor.hasMarkedText() else { return }
        if resetSelection {
            selectedPath = nil; scrollOrigin = .zero
        } else if !awaiting {
            selectedPath = skills.indices.contains(table.selectedRow) ? skills[table.selectedRow].id : nil
            scrollOrigin = scroll.contentView.bounds.origin
        }
        gate.begin()
        presentation.begin(background: background)
        refreshedAt = ProcessInfo.processInfo.systemUptime
        spinnerDelay?.invalidate(); spinnerDelay = nil
        if !presentation.hasSnapshot {
            scroll.isHidden = true; stateLabel.isHidden = true
        }
        if !presentation.quiet {
            spinnerDelay = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: false) { [weak self] _ in
                guard let self = self, self.visible, self.awaiting else { return }; self.spinner.startAnimation(nil)
            }
        }
        emit(["action":"refresh", "id": revision, "query": search.stringValue])
    }

    func close(_ reason: String) {
        guard visible else { return }
        visible = false; gate.cancel()
        cadence?.invalidate(); cadence = nil; spinnerDelay?.invalidate(); spinner.stopAnimation(nil)
        cacheExpiry?.invalidate(); cacheExpiry = nil
        if reason == "selection" { cache.select() } else {
            cache.cancel(search.stringValue, now: ProcessInfo.processInfo.systemUptime)
            cacheExpiry = Timer.scheduledTimer(withTimeInterval: 150, repeats: false) { [weak self] _ in self?.cache.select() }
        }
        panel.orderOut(nil)
        search.stringValue = ""
        emit(["action":"closed", "reason": reason])
    }

    func windowDidResignKey(_ notification: Notification) { close("focus-lost") }
    func windowWillReturnFieldEditor(_ sender: NSWindow, to client: Any?) -> Any? {
        (client as? NSTextField) === search ? searchEditor : nil
    }
    func controlTextDidChange(_ notification: Notification) {
        guard !normalizingInput else { return }
        if let editor = search.currentEditor() as? NSTextView {
            guard !editor.hasMarkedText() else { return }
            let result = SearchInput.normalize(editor.string)
            if result.text != editor.string {
                normalizingInput = true
                let selection = editor.selectedRange()
                editor.insertText(result.text, replacementRange: NSRange(location: 0, length: editor.string.utf16.count))
                editor.setSelectedRange(NSRange(location: result.offset(selection.location), length: result.offset(NSMaxRange(selection)) - result.offset(selection.location)))
                normalizingInput = false
            }
        }
        refresh(resetSelection: true)
    }
    func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
        if textView.hasMarkedText() { return false }
        switch selector {
        case #selector(NSResponder.moveDown(_:)), #selector(NSResponder.moveUp(_:)):
            guard (!awaiting || presentation.quiet), !skills.isEmpty else { return true }
            let delta = selector == #selector(NSResponder.moveDown(_:)) ? 1 : -1
            let index = min(max(table.selectedRow + delta, 0), skills.count - 1)
            table.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false); table.scrollRowToVisible(index); return true
        case #selector(NSResponder.insertNewline(_:)): choose(); return true
        case #selector(NSResponder.cancelOperation(_:)): close("escape"); return true
        default: return false
        }
    }

    func numberOfRows(in tableView: NSTableView) -> Int { skills.count }
    func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? {
        let view = ZincRow()
        view.selectionColor = SkillTint(name: skills[row].name, harnesses: skills[row].harnesses).selectionColor
        let width = (skills[row].title as NSString).size(withAttributes: [.font:NSFont.monospacedSystemFont(ofSize: 13.5, weight: .medium)]).width
        view.selectionWidth = min(width + 12, max(0, tableView.bounds.width - 74))
        return view
    }
    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let cell = NSTableCellView()
        let skill = skills[row]
        let text = NSTextField(labelWithString: skill.title)
        text.font = .monospacedSystemFont(ofSize: 13.5, weight: .medium)
        text.textColor = SkillTint(name: skill.name, harnesses: skill.harnesses).textColor
        text.lineBreakMode = .byTruncatingTail
        text.translatesAutoresizingMaskIntoConstraints = false
        cell.addSubview(text); cell.textField = text
        let mark = AvailabilityView(); mark.availability = Availability(harnesses: skill.harnesses)
        mark.translatesAutoresizingMaskIntoConstraints = false; mark.wantsLayer = true; cell.addSubview(mark)
        NSLayoutConstraint.activate([text.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 14), text.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -72), text.centerYAnchor.constraint(equalTo: cell.centerYAnchor), mark.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -8), mark.widthAnchor.constraint(equalToConstant: 54), mark.topAnchor.constraint(equalTo: cell.topAnchor), mark.bottomAnchor.constraint(equalTo: cell.bottomAnchor)])
        cell.setAccessibilityLabel(skill.title + ", " + mark.availability.label)
        return cell
    }
    @objc func choose() {
        guard visible, !searchEditor.hasMarkedText(), gate.canSelect, skills.indices.contains(table.selectedRow) else { return }
        let skill = skills[table.selectedRow]
        emit(["action":"select", "id": revision, "name": skill.name, "path": skill.path, "skill_id": skill.id])
        close("selection")
    }
}

// Accessory apps still need the standard menu key equivalents. Nil targets
// route editing to the focused field editor; no global shortcut hook is needed.
func installEditingMenu(on app: NSApplication) {
    let menu = NSMenu()
    let edit = NSMenu(title: "Edit")
    let root = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
    root.submenu = edit; menu.addItem(root)
    for (title, action, key, modifiers) in [
        ("Undo", "undo:", "z", NSEvent.ModifierFlags.command),
        ("Redo", "redo:", "z", NSEvent.ModifierFlags([.command, .shift])),
        ("Cut", "cut:", "x", NSEvent.ModifierFlags.command),
        ("Copy", "copy:", "c", NSEvent.ModifierFlags.command),
        ("Paste", "paste:", "v", NSEvent.ModifierFlags.command),
        ("Select All", "selectAll:", "a", NSEvent.ModifierFlags.command)
    ] {
        let item = NSMenuItem(title: title, action: NSSelectorFromString(action), keyEquivalent: key)
        item.keyEquivalentModifierMask = modifiers
        edit.addItem(item)
    }
    app.mainMenu = menu
}

@main enum SkillPickerMain {
    static func main() {
        if CommandLine.arguments.contains("--self-test") { runSearchInputRegression(); runModelRegression() }
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        installEditingMenu(on: app)
        let popup = Popup()
        app.delegate = popup
        app.run()
    }
}
