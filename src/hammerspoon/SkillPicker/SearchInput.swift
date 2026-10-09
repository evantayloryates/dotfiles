import AppKit

// A small, pure policy: remove layout-producing whitespace, not user meaning.
// Ordinary horizontal spacing is preserved unless it borders a break or tab.
struct SearchInput {
    struct Result {
        let text: String
        private let offsets: [Int]?
        init(text: String, offsets: [Int]? = nil) { self.text = text; self.offsets = offsets }
        func offset(_ original: Int) -> Int {
            guard let offsets = offsets else { return min(max(0, original), text.utf16.count) }
            return offsets[min(max(0, original), offsets.count - 1)]
        }
    }
    static func normalize(_ input: String) -> Result {
        let scalars = Array(input.unicodeScalars)
        guard scalars.contains(where: { CharacterSet.newlines.contains($0) || $0 == "\t" }) else { return Result(text: input) }
        var output = "", map = [Int](repeating: 0, count: input.utf16.count + 1)
        var index = 0, sourceOffset = 0, destinationOffset = 0
        while index < scalars.count {
            let start = index, sourceStart = sourceOffset
            if CharacterSet.whitespacesAndNewlines.contains(scalars[index]) {
                var collapse = false
                while index < scalars.count && CharacterSet.whitespacesAndNewlines.contains(scalars[index]) {
                    collapse = collapse || CharacterSet.newlines.contains(scalars[index]) || scalars[index] == "\t"
                    sourceOffset += scalars[index].value > 0xFFFF ? 2 : 1
                    index += 1
                }
                if collapse {
                    map[sourceStart] = destinationOffset
                    output.append(" "); destinationOffset += 1
                    for boundary in (sourceStart + 1)...sourceOffset { map[boundary] = destinationOffset }
                    continue
                }
            } else {
                sourceOffset += scalars[index].value > 0xFFFF ? 2 : 1
                index += 1
            }
            for boundary in sourceStart...sourceOffset { map[boundary] = destinationOffset + boundary - sourceStart }
            for scalar in scalars[start..<index] { output.unicodeScalars.append(scalar) }
            destinationOffset += sourceOffset - sourceStart
        }
        return Result(text: output, offsets: map)
    }
    // A clipboard-only convenience, not a rule for ordinary typing or search.
    static func clipboardRange(current: String, selection: NSRange, incoming: String) -> NSRange {
        let prefix = "taylor-"
        if current == prefix && selection == NSRange(location: prefix.utf16.count, length: 0) && incoming.hasPrefix(prefix) {
            return NSRange(location: 0, length: prefix.utf16.count)
        }
        return selection
    }
}

final class SearchField: NSTextField {
    override var stringValue: String {
        get { super.stringValue }
        set { super.stringValue = SearchInput.normalize(newValue).text }
    }
}

final class SearchFieldEditor: NSTextView {
    // AppKit uses the same insertion boundary for keyboard input, dictation,
    // committed IME text and native services. Keep preedit text untouched.
    override func insertText(_ value: Any, replacementRange: NSRange) {
        let incoming: String
        if let text = value as? String { incoming = text }
        else if let text = value as? NSAttributedString { incoming = text.string }
        else { super.insertText(value, replacementRange: replacementRange); return }
        let current = string as NSString
        let range = replacementRange.location == NSNotFound ? (hasMarkedText() ? markedRange() : selectedRange()) : replacementRange
        guard range.location <= current.length && range.length <= current.length - range.location else { return }
        let proposed = current.replacingCharacters(in: range, with: incoming)
        let result = SearchInput.normalize(proposed)
        if result.text == proposed {
            super.insertText(value, replacementRange: replacementRange)
        } else {
            // One native edit keeps undo atomic, including whitespace on either
            // side of the insertion; mapped UTF-16 offsets preserve the caret.
            super.insertText(result.text, replacementRange: NSRange(location: 0, length: current.length))
            setSelectedRange(NSRange(location: result.offset(range.location + incoming.utf16.count), length: 0))
        }
    }
    override func readSelection(from pasteboard: NSPasteboard, type: NSPasteboard.PasteboardType) -> Bool {
        if let text = pasteboard.string(forType: .string) {
            insertClipboardText(text)
            return true
        }
        // Let AppKit decode a rich-only clipboard into a detached plain-text
        // view, then use the same insertion policy and one real undo action.
        let decoded = NSTextView()
        decoded.isRichText = false; decoded.importsGraphics = false
        guard decoded.readSelection(from: pasteboard, type: type) else { return false }
        insertClipboardText(decoded.string)
        return true
    }
    private func insertClipboardText(_ text: String) {
        let range = hasMarkedText() ? markedRange() : SearchInput.clipboardRange(current: string, selection: selectedRange(), incoming: text)
        insertText(text, replacementRange: range)
    }
    override func insertLineBreak(_ sender: Any?) { insertText("\n", replacementRange: NSRange(location: NSNotFound, length: 0)) }
    override func insertNewlineIgnoringFieldEditor(_ sender: Any?) { insertLineBreak(sender) }
}

func runSearchInputRegression() {
    let cases = [
        ("hello\n \n\t there", "hello there"), ("a\r\n\r\n b", "a b"),
        ("a\rb\u{85}c\u{2028}d\u{2029}e\u{B}f\u{C}g", "a b c d e f g"),
        ("a\t\t b", "a b"), ("  ordinary  spacing  ", "  ordinary  spacing  "),
        ("\n\n word\n", " word "), ("café 👩🏽‍💻\n\n e\u{301} /$-'", "café 👩🏽‍💻 e\u{301} /$-'"),
        ("first \u{A0}\n\u{2003} second", "first second"), ("", "")
    ]
    for (input, expected) in cases {
        let result = SearchInput.normalize(input)
        precondition(result.text == expected)
        precondition(SearchInput.normalize(result.text).text == expected)
        let positions = (0...input.utf16.count).map { result.offset($0) }
        precondition(positions == positions.sorted() && positions.last == expected.utf16.count)
        precondition(!result.text.unicodeScalars.contains { CharacterSet.newlines.contains($0) || $0 == "\t" })
    }
    let mapped = SearchInput.normalize("👩🏽‍💻 one\r\n \n two")
    precondition(mapped.offset("👩🏽‍💻 one\r\n \n ".utf16.count) == "👩🏽‍💻 one ".utf16.count)
    var seed: UInt64 = 23
    let alphabet = ["word", " ", "  ", "\n", "\r\n", "\t", "\u{2028}", "☕", "👩🏽‍💻", "e\u{301}"]
    for _ in 0..<256 {
        var input = ""
        for _ in 0..<32 { seed = seed &* 6364136223846793005 &+ 1; input += alphabet[Int(seed % UInt64(alphabet.count))] }
        let result = SearchInput.normalize(input)
        precondition(SearchInput.normalize(result.text).text == result.text)
        precondition(!result.text.unicodeScalars.contains { CharacterSet.newlines.contains($0) || $0 == "\t" })
        let positions = (0...input.utf16.count).map { result.offset($0) }
        precondition(positions == positions.sorted() && positions.last == result.text.utf16.count)
    }
    print("Search input: 9 semantic cases, UTF-16 caret mapping, 256 mixed Unicode/idempotence cases passed")
}

private final class SearchInputUndoDelegate: NSObject, NSTextViewDelegate {
    let manager = UndoManager()
    func undoManager(for view: NSTextView) -> UndoManager? { manager }
}

func runFieldEditorRegression() {
    let editor = SearchFieldEditor(frame: NSRect(x: 0, y: 0, width: 200, height: 30))
    editor.isRichText = false; editor.allowsUndo = true
    let delegate = SearchInputUndoDelegate(); editor.delegate = delegate
    delegate.manager.groupsByEvent = false
    editor.string = "hello world"; editor.setSelectedRange(NSRange(location: 5, length: 1))
    delegate.manager.beginUndoGrouping()
    editor.insertText(NSAttributedString(string: " \r\n \n  "), replacementRange: NSRange(location: NSNotFound, length: 0))
    delegate.manager.endUndoGrouping()
    precondition(editor.string == "hello world" && editor.selectedRange().location == 6)
    // Use a content-changing edit to check that undo is one native action.
    delegate.manager.removeAllActions()
    delegate.manager.beginUndoGrouping()
    editor.insertText("new\n\n \t ", replacementRange: NSRange(location: 6, length: 0))
    delegate.manager.endUndoGrouping()
    precondition(editor.string == "hello new world" && editor.selectedRange().location == 10)
    precondition(delegate.manager.canUndo)
    delegate.manager.undo(); precondition(editor.string == "hello world")
    delegate.manager.redo(); precondition(editor.string == "hello new world")
    delegate.manager.removeAllActions()
    editor.string = ""; editor.setSelectedRange(NSRange(location: 0, length: 0))
    delegate.manager.beginUndoGrouping()
    editor.setMarkedText("にほん", selectedRange: NSRange(location: 3, length: 0), replacementRange: NSRange(location: NSNotFound, length: 0))
    precondition(editor.hasMarkedText() && editor.string == "にほん")
    editor.insertText("日本\n語", replacementRange: NSRange(location: NSNotFound, length: 0))
    delegate.manager.endUndoGrouping()
    precondition(!editor.hasMarkedText() && editor.string == "日本 語")
    precondition(editor.selectedRange().location == "日本 語".utf16.count)
    print("Field editor: attributed replacement, caret, atomic undo/redo, IME preedit/commit passed")
    let board = NSPasteboard.withUniqueName()
    defer { board.releaseGlobally() }
    let cases: [(String, NSRange, String, String)] = [
        ("taylor-", NSRange(location: 7, length: 0), "taylor-audio-ingest", "taylor-audio-ingest"),
        ("taylor-", NSRange(location: 7, length: 0), "taylor-bulk-review", "taylor-bulk-review"),
        ("taylor-", NSRange(location: 7, length: 0), "audio-ingest", "taylor-audio-ingest"),
        ("taylor-", NSRange(location: 0, length: 7), "taylor-audio-ingest", "taylor-audio-ingest"),
        ("taylor-", NSRange(location: 0, length: 0), "taylor-audio-ingest", "taylor-audio-ingesttaylor-"),
        ("taylor-", NSRange(location: 6, length: 1), "taylor-audio-ingest", "taylortaylor-audio-ingest"),
        ("taylor-code", NSRange(location: 11, length: 0), "taylor-audio-ingest", "taylor-codetaylor-audio-ingest"),
        ("taylor-", NSRange(location: 7, length: 0), "Taylor-audio-ingest", "taylor-Taylor-audio-ingest"),
        ("taylor-", NSRange(location: 7, length: 0), "taylor-audio-ingest\r\n \n", "taylor-audio-ingest ")
    ]
    for (current, selection, incoming, expected) in cases {
        delegate.manager.removeAllActions()
        editor.string = current; editor.setSelectedRange(selection)
        board.clearContents(); precondition(board.setString(incoming, forType: .string))
        delegate.manager.beginUndoGrouping()
        precondition(editor.readSelection(from: board, type: .string))
        delegate.manager.endUndoGrouping()
        precondition(editor.string == expected)
        let range = SearchInput.clipboardRange(current: current, selection: selection, incoming: incoming)
        let proposal = (current as NSString).replacingCharacters(in: range, with: incoming)
        precondition(editor.selectedRange() == NSRange(location: SearchInput.normalize(proposal).offset(range.location + incoming.utf16.count), length: 0))
        delegate.manager.undo(); precondition(editor.string == current)
        delegate.manager.redo(); precondition(editor.string == expected)
    }
    editor.string = "taylor-"; editor.setSelectedRange(NSRange(location: 7, length: 0))
    delegate.manager.beginUndoGrouping()
    editor.insertText("taylor-audio-ingest", replacementRange: NSRange(location: NSNotFound, length: 0))
    delegate.manager.endUndoGrouping()
    precondition(editor.string == "taylor-taylor-audio-ingest")
    print("Clipboard prefix: 9 context cases, caret and atomic undo/redo; ordinary insertion unchanged passed")
}
