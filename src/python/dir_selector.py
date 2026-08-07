#!/usr/bin/env python3
"""Fast reusable directory-item selector with truecolor TUI.

Designed for ~hundreds of items. UI goes to stderr; result is returned to the
caller (or printed as JSON when run as CLI).
"""
from __future__ import annotations

import argparse
import json
import os
import select
import sys
import termios
import tty
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple


# ── truecolor theme (hex) ────────────────────────────────────────────────────
# Semantic tokens — muted chrome, crisp names, soft error red.
THEME = {
    'index': '#6b7280',
    'name': '#e5e7eb',
    'section': '#7dd3fc',
    'prompt': '#a5b4fc',
    'error': '#f87171',
    'dim': '#64748b',
    'hint': '#94a3b8',
    'reset': '\033[0m',
}

EXIT = object()


def _hex_to_rgb(h: str) -> Tuple[int, int, int]:
    h = h[1:] if h.startswith('#') else h
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def fg(hex_color: str) -> str:
    if os.environ.get('NO_COLOR') is not None:
        return ''
    r, g, b = _hex_to_rgb(hex_color)
    return f'\033[38;2;{r};{g};{b}m'


def style(text: str, hex_color: str) -> str:
    code = fg(hex_color)
    if not code:
        return text
    return f'{code}{text}{THEME["reset"]}'


def present(*args, **kwargs) -> None:
    kwargs.setdefault('end', '\n')
    kwargs.setdefault('flush', True)
    print(*args, file=sys.stderr, **kwargs)


@dataclass(slots=True)
class Item:
    name: str
    path: str
    mtime: float = 0.0


@dataclass(slots=True)
class Selection:
    item: Item
    action: Optional[str] = None  # remainder after first token, if any


# ── scanning ─────────────────────────────────────────────────────────────────

def scan_items(
    root: str,
    *,
    dirs_only: bool = False,
    allow_files: bool = True,
) -> List[Item]:
    """Single scandir pass. Skips hidden (dot-prefixed) names."""
    items: List[Item] = []
    try:
        with os.scandir(root) as it:
            for entry in it:
                name = entry.name
                if name.startswith('.'):
                    continue
                try:
                    is_dir = entry.is_dir(follow_symlinks=False)
                    is_file = entry.is_file(follow_symlinks=False)
                except OSError:
                    continue
                if dirs_only and not is_dir:
                    continue
                if not allow_files and not is_dir:
                    continue
                if not is_dir and not is_file:
                    continue
                try:
                    mtime = entry.stat(follow_symlinks=False).st_mtime
                except OSError:
                    mtime = 0.0
                items.append(Item(name=name, path=entry.path, mtime=mtime))
    except FileNotFoundError:
        return []
    return items


# ── matching ─────────────────────────────────────────────────────────────────

def parse_query(raw: str) -> Tuple[str, Optional[str]]:
    """Split 'hum open -a X' -> ('hum', 'open -a X')."""
    text = (raw or '').strip()
    if not text:
        return '', None
    parts = text.split(None, 1)
    query = parts[0]
    action = parts[1] if len(parts) > 1 else None
    return query, action


def match_query(
    query: str,
    by_num: dict[int, Item],
    items_for_prefix: Sequence[Item],
) -> Tuple[Optional[Item], Optional[str]]:
    """Return (item, error). error is a short red-line message when unresolved."""
    if not query:
        return None, None

    if query.isdigit():
        if query.startswith('0') and query != '0':
            # leading zeros: still accept as int if in range
            pass
        try:
            n = int(query)
        except ValueError:
            return None, 'Invalid number.'
        if n < 1 or n not in by_num:
            return None, 'Number out of range.'
        return by_num[n], None

    q = query.lower()
    hits = [it for it in items_for_prefix if it.name.lower().startswith(q)]
    if len(hits) == 1:
        return hits[0], None
    if len(hits) == 0:
        return None, 'No match. Empty exits.'
    return None, 'Ambiguous match — refine.'


# ── numbering / render ───────────────────────────────────────────────────────

def build_numbering(
    all_items: Sequence[Item],
    recent_items: Sequence[Item],
) -> dict[int, Item]:
    """High-to-low numbers; 1 closest to the prompt (bottom)."""
    by_num: dict[int, Item] = {}
    r = len(recent_items)
    n = r + len(all_items)
    # Recent: ascending recency (oldest of set at top → higher nums)
    for i, item in enumerate(recent_items):
        by_num[r - i] = item
    # All: lex A→Z top to bottom → first lex gets highest number
    for i, item in enumerate(all_items):
        by_num[n - i] = item
    return by_num


def recent_subset(items: Sequence[Item], n: int) -> List[Item]:
    if n <= 0 or not items:
        return []
    top = sorted(items, key=lambda it: it.mtime, reverse=True)[:n]
    # ascending recency for display (most recent at bottom)
    return sorted(top, key=lambda it: it.mtime)


def render_list(
    all_items: Sequence[Item],
    recent_items: Sequence[Item],
    by_num: dict[int, Item],
    *,
    show_sections: bool,
) -> None:
    r = len(recent_items)
    total = r + len(all_items)
    pad = len(str(total)) if total else 1
    idx_c = fg(THEME['index'])
    name_c = fg(THEME['name'])
    sec_c = fg(THEME['section'])
    reset = THEME['reset'] if idx_c else ''

    lines: List[str] = []
    if show_sections and all_items:
        lines.append(f'{sec_c}All:{reset}' if sec_c else 'All:')

    for i, item in enumerate(all_items):
        num = total - i
        if idx_c:
            lines.append(f'{idx_c}{num:>{pad}}){reset} {name_c}{item.name}{reset}')
        else:
            lines.append(f'{num:>{pad}}) {item.name}')

    if recent_items:
        if show_sections:
            if all_items:
                lines.append('')
            lines.append(f'{sec_c}Recent:{reset}' if sec_c else 'Recent:')
        for i, item in enumerate(recent_items):
            num = r - i
            if idx_c:
                lines.append(f'{idx_c}{num:>{pad}}){reset} {name_c}{item.name}{reset}')
            else:
                lines.append(f'{num:>{pad}}) {item.name}')

    if lines:
        present('\n'.join(lines))


# ── raw input ────────────────────────────────────────────────────────────────

def _open_tty():
    return open('/dev/tty', 'r')


def read_query(
    prompt: str,
    *,
    tty_in=None,
) -> object:
    """Read one query line. Returns str, or EXIT sentinel.

    Ctrl+C + non-empty buffer → clear input, keep going (returns to caller via
    loop inside). Ctrl+C + empty → EXIT. Ctrl+D → EXIT always.
    """
    present(prompt, end='', flush=True)
    stream = tty_in or _open_tty()
    owns = tty_in is None
    fd = stream.fileno()
    old = termios.tcgetattr(fd)
    buf: List[str] = []

    def crlf() -> None:
        sys.stderr.write('\r\n')
        sys.stderr.flush()

    def redraw_prompt() -> None:
        sys.stderr.write('\r\x1b[2K')
        sys.stderr.write(prompt)
        sys.stderr.flush()

    try:
        tty.setraw(fd)
        while True:
            b = os.read(fd, 1)
            if not b:
                crlf()
                return EXIT

            ch = b.decode('utf-8', errors='ignore')

            if ch == '\x03':  # Ctrl+C
                if buf:
                    buf.clear()
                    redraw_prompt()
                    continue
                crlf()
                return EXIT

            if ch == '\x04':  # Ctrl+D
                crlf()
                return EXIT

            if ch == '\x1b':
                # swallow CSI sequences; bare ESC exits
                if select.select([fd], [], [], 0.05)[0]:
                    while True:
                        extra = os.read(fd, 1)
                        if not extra:
                            break
                        c = extra.decode('utf-8', errors='ignore')
                        if c.isalpha() or c == '~':
                            break
                        if not select.select([fd], [], [], 0.05)[0]:
                            break
                else:
                    crlf()
                    return EXIT
                continue

            if ch in ('\r', '\n'):
                crlf()
                return ''.join(buf)

            if ch in ('\x7f', '\b'):
                if buf:
                    buf.pop()
                    sys.stderr.write('\b \b')
                    sys.stderr.flush()
                continue

            if ch < ' ':
                continue

            buf.append(ch)
            sys.stderr.write(ch)
            sys.stderr.flush()
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
        if owns:
            stream.close()


def _rewrite_error_line(error: str) -> None:
    """After Enter, cursor is on the line below the prompt. Fix error + clear prompt line."""
    # up to prompt, clear; up to error, rewrite; leave cursor on prompt line
    sys.stderr.write('\x1b[1A\r\x1b[2K')  # prompt line
    sys.stderr.write('\x1b[1A\r\x1b[2K')  # error line
    if error:
        sys.stderr.write(style(error, THEME['error']))
    sys.stderr.write('\r\n')  # sit on cleared prompt line
    sys.stderr.flush()


# ── main select loop ─────────────────────────────────────────────────────────

def select_items(
    items: Sequence[Item],
    *,
    prompt: str = 'Select: ',
    noun: str = 'item',
    recent: int = 0,
    show_sections: Optional[bool] = None,
) -> Optional[Selection]:
    """Interactive select. Returns Selection or None if cancelled.

    Non-interactive: set PATHFUNCS_SELECT_QUERY to a one-shot query string
    (used by tests/smoke). Skips TUI when set.
    """
    if not items:
        present(style(f'No {noun}s found.', THEME['error']))
        return None

    all_items = sorted(items, key=lambda it: it.name.lower())
    recent_items = recent_subset(items, recent)
    show_sec = show_sections if show_sections is not None else (recent > 0)
    by_num = build_numbering(all_items, recent_items)
    prefix_pool = all_items

    # One-shot / queued non-interactive resolve (tests / scripted use).
    # PATHFUNCS_SELECT_QUERY is consumed first; then PATHFUNCS_SELECT_QUERIES
    # (newline-separated) is shifted for nested selectors (e.g. html file pick).
    oneshot = os.environ.pop('PATHFUNCS_SELECT_QUERY', None)
    if oneshot is None:
        queued = os.environ.get('PATHFUNCS_SELECT_QUERIES')
        if queued is not None:
            parts = queued.split('\n')
            oneshot = parts[0]
            rest = parts[1:]
            if rest:
                os.environ['PATHFUNCS_SELECT_QUERIES'] = '\n'.join(rest)
            else:
                os.environ.pop('PATHFUNCS_SELECT_QUERIES', None)
    if oneshot is not None:
        query, action = parse_query(oneshot)
        if not query:
            return None
        item, err = match_query(query, by_num, prefix_pool)
        if item is None:
            if err:
                present(style(err, THEME['error']))
            return None
        return Selection(item=item, action=action)

    render_list(all_items, recent_items, by_num, show_sections=show_sec)
    present('')  # blank error line

    colored_prompt = style(prompt, THEME['prompt']) if fg(THEME['prompt']) else prompt

    while True:
        raw = read_query(colored_prompt)
        if raw is EXIT:
            return None

        assert isinstance(raw, str)
        query, action = parse_query(raw)

        if not query:
            return None

        item, err = match_query(query, by_num, prefix_pool)
        if item is not None:
            return Selection(item=item, action=action)

        _rewrite_error_line(err or 'No match. Empty exits.')


def select_from_dir(
    root: str,
    *,
    prompt: str = 'Select: ',
    noun: str = 'item',
    recent: int = 0,
    dirs_only: bool = False,
) -> Optional[Selection]:
    items = scan_items(root, dirs_only=dirs_only)
    return select_items(
        items,
        prompt=prompt,
        noun=noun,
        recent=recent,
        show_sections=recent > 0,
    )


def select_filenames(
    names: Sequence[str],
    *,
    base_dir: str,
    prompt: str = 'Select HTML: ',
    noun: str = 'file',
) -> Optional[Selection]:
    """Simple mini-selector over bare filenames (no recent section)."""
    items = [
        Item(name=n, path=os.path.join(base_dir, n), mtime=0.0)
        for n in names
    ]
    return select_items(items, prompt=prompt, noun=noun, recent=0, show_sections=False)


def emit_copied(path: str) -> None:
    """Print path to stdout with dim (copied) aside; copy bare path to clipboard."""
    try:
        import subprocess
        subprocess.run(['/usr/bin/pbcopy'], input=path.encode(), check=False)
    except Exception:
        pass
    dim = style('(copied)', THEME['dim'])
    # path emphasized on stdout; dim aside on same line
    sys.stdout.write(path)
    if dim:
        sys.stdout.write(' ' + dim)
    else:
        sys.stdout.write(' (copied)')
    sys.stdout.write('\n')
    sys.stdout.flush()


def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(description='Reusable directory item selector')
    p.add_argument('root', help='Directory to list')
    p.add_argument('--prompt', default='Select: ')
    p.add_argument('--noun', default='item')
    p.add_argument('--recent', type=int, default=0)
    p.add_argument('--dirs-only', action='store_true')
    p.add_argument('--json', action='store_true', help='Emit JSON result on stdout')
    args = p.parse_args(argv)

    sel = select_from_dir(
        args.root,
        prompt=args.prompt,
        noun=args.noun,
        recent=args.recent,
        dirs_only=args.dirs_only,
    )
    if sel is None:
        return 1
    payload = {
        'name': sel.item.name,
        'path': sel.item.path,
        'action': sel.action,
    }
    if args.json:
        print(json.dumps(payload))
    else:
        print(sel.item.path)
        if sel.action:
            print(sel.action)
    return 0


if __name__ == '__main__':
    sys.exit(main())
