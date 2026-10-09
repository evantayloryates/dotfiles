# Skill picker

Press **Ctrl+Space**. Search starts at `taylor-`, with the cursor after the
hyphen. Type to filter alphabetically; **↑/↓** and **Enter**, or a single row
click, choose a skill. Selection copies exactly `/skill-name`, with no leading
or trailing whitespace, and closes. **Cmd+V**
pastes `/skill-name` into your chosen Claude or Codex draft. **Escape**, another shortcut press, or
any outside click closes without selecting.

The search field supports standard macOS editing: **Cmd+V** pastes at the cursor
or replaces selected text, **Cmd+A** selects the query, and **Cmd+Z / Cmd+Shift+Z**
undo/redo edits. Copy and cut use the native field editor. The accessory helper
registers normal Edit-menu key equivalents with responder-chain targets; no
global clipboard monitoring, custom paste parser or extra permissions are needed.
All committed inbound text uses a shared single-line transformation before
insertion: runs containing line breaks or tabs, including surrounding whitespace,
become one space. This includes CRLF and Unicode line/paragraph separators.
Ordinary spacing, case, punctuation, accents and emoji remain intact. Paste,
native services and programmatic field values use this same policy; paste never
chooses a skill. When the query is exactly `taylor-` with an empty selection
and the caret after the hyphen, a pasted value beginning with `taylor-` replaces
the default prefix rather than duplicating it. This clipboard-only exception
preserves the pasted text and places the caret after it; other caret positions
and query contents use normal insertion. The custom AppKit field editor preserves UTF-16 caret positions
and native atomic undo/redo. IME preedit stays untouched until committed;
refresh and result selection wait for composition to finish.

Cancelled input is retained in memory for **150 seconds**, including an empty
search. Selection clears it; expiry restores `taylor-`. Nothing is saved to disk.
The popup opens on the display containing the cursor at invocation, then stays
there until closed. It has no titlebar, window controls, footer, descriptions,
icons, refresh button, details view, or shortcut toast.

The catalog refreshes on each input change and every **3 seconds while open**.
Initial searches wait for confirmed results. Filter changes keep the previous
view visible until a genuinely different result or status is confirmed. Repeated
empty results keep the same "No matching skills" label, and identical row sets
keep their existing cells. Selection stays blocked while a new filter is pending.
A native spinner appears after 120 ms for slower foreground replies. Periodic refresh keeps
the current confirmed view visible without a spinner. Identical results and
background failures perform no view mutations or table reloads. Changed results
commit in one main-thread transaction with animations disabled, without clearing
the existing list. Periodic updates preserve selection and scroll position.
Old replies cannot reveal results or be selected.
Duplicate names show a short owner suffix and copy an exact-file instruction
with the attributed Claude/Codex paths, so the current harness can choose its own version.
Selection changes the clipboard; the picker never types or submits a message.
Skill contents and memories remain unchanged.

## Runtime

`init.lua` keeps the compiled `SkillPicker.app` AppKit panel and a Python catalog
reader warm. The reader owns one read-only Codex `app-server --stdio` process;
it makes no model calls or chats. A metadata fingerprint avoids reloading an
unchanged native inventory. New files, removals and metadata edits invalidate it.
Input requests coalesce to one running request and the latest waiting query.
Native failures time out and retry; an exited reader restarts on the next refresh.
Closing stops the refresh timer. Hammerspoon reload closes the helpers' stdin,
which retires them and the owned Codex child cleanly. Full shutdown deliberately
avoids `hs.hotkey:delete()` because its logging passes through `hs.ipc` while
CLI ports are being torn down. Hammerspoon disposes native hotkeys when it
replaces the Lua state; explicit deletion is used only for an in-place module
replacement. This avoids the message-port shutdown crash observed on
Hammerspoon 1.1.1/macOS 26.5.1 on 2026-10-01. This uses public AppKit
blur APIs, not a patched Codex app or a WebKit page. macOS Reduce Transparency
can change the glass appearance. Secure Input suppresses opening.

## Sources and identity

`harnesses.json` configures an ordered list of harness IDs and inventory providers.
Codex uses its enabled native global inventory (custom, system and plugins);
Claude uses the independent `~/.claude/skills` directory, including synced skills.
Codex registrations with `enabled = false` are omitted. Directory providers honor
top-level `user-invocable: false` in SKILL.md frontmatter. Visibility is filtered
per source before merging, so a hidden child does not reappear through another
harness. Internal files remain available for global entry points to read and route
to; `allow_implicit_invocation: false` alone does not hide an explicit entry.
Flag and native-config edits are detected by metadata fingerprints on refresh.
Repository-specific skills and Claude plugins outside that directory are not inferred.
No files or memories are synced. Availability means the invocation name has an
attributed source in that inventory; it does not mean the two versions have identical
instructions. Matching names merge across harnesses. Same-harness collisions retain
owner identities and every path. Removing one source updates attribution without
removing the other source or changing the record ID. Failed scans do not publish a
partial union. Bounded frontmatter reads support optional names; symlink cycles are
bounded. Unchanged scans use cached names and metadata only.

A third harness can be added with an absolute or home-relative directory root:
`{"id":"third","provider":"directory","root":"~/third/skills"}`.
The backend handles any number of configured harnesses. The current presentation
is intentionally optimized for Claude, Codex and both; additional/unknown harnesses
show `?` rather than a false two-harness label. Accessibility names retain all IDs.
Changes to configuration are detected on the next refresh.

## Presentation

Skills available in both Claude and Codex have no visible availability label.
Single-harness skills show **Claude** or **Codex** in a quiet, right-aligned
column. Taylor-prefixed single-harness skill titles also use a near-white tint:
warm peach for Claude, pale blue for Codex. Their selection frames are slightly
darker (9% tint opacity versus 14% neutral); shared and non-Taylor titles stay
neutral white. Hue comes from a 30% blend with the base color, preserving bright
text against zinc glass. Additional or unknown harness combinations show `?`; accessibility
labels retain their complete source attribution. There is one committed design,
with no comparison mode, option label or Ctrl+arrow interception.

The width is **396 px**, 20% wider than the original 330 px popup; height remains
420 px. The separator sits 58 px below the top, seven pixels higher than before.
A plain native table removes macOS's automatic cell inset. Titles form one aligned
column; the selected frame begins at the separator's 16 px inset, hugs the visible
text with six-point padding, and excludes the availability column. Longer names
truncate while full accessibility labels and source identities remain intact.

`~/.hammerspoon/init.lua` imports `SkillPicker` automatically. To disable it,
remove that import and reload Hammerspoon. Rebuild only after changing Swift
source with `/Users/taylor/.hammerspoon/SkillPicker/build.sh`, then reload.
The build includes executable cache, refresh-gate and presentation checks,
plus semantic and mixed-Unicode input normalization, caret/undo/IME,
private plain/rich pasteboards, connected field-value checks, six availability
states, window/separator/label geometry, and 2,000 background refreshes, 1,000 repeated bogus-character empty results
and 1,000 identical-result filter changes through the actual AppKit renderer
in a hidden-window regression test. It checks stable cells, label text and
frame, visibility, selection and scroll position, plus changed-result transitions. Run Python checks:

```sh
python3 -m unittest discover -s /Users/taylor/.hammerspoon/SkillPicker/tests -v
```

A CLI reload can return a message-port invalidation/transport error as the old
Lua state disappears. Verify the Hammerspoon process and the new helper/reader
readiness afterward; the CLI exit code alone does not distinguish a successful
reload from a crash. Two full CLI reloads with silent shutdown retained the
same Hammerspoon PID and retired the old helpers in the 2026-10-01 check.
