#!/usr/bin/env python3
"""Per-pathfunc resolve/actions built on dir_selector.

skills: pick a skill dir → SKILL.md (dir fallback + warning)
html:   pick a report dir/file → index.html / .hint / single / mini-select
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import List, Optional, Sequence, Tuple

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from dir_selector import (  # noqa: E402
    Item,
    emit_copied,
    present,
    scan_items,
    select_filenames,
    select_items,
    style,
    THEME,
)

HINT_NAME = '.hint'


# ── result protocol ──────────────────────────────────────────────────────────
# copy mode: emit_copied() prints "path (copied)" to stdout
# run mode:  three lines — marker, action, path — so the shell needs no JSON

_RUN_MARKER = '__PATHFUNCS_RUN__'


def emit_run(path: str, action: str) -> None:
    print(_RUN_MARKER)
    print(action)
    print(path)


# ── skills ───────────────────────────────────────────────────────────────────

def resolve_skill_target(skill_dir: str) -> Tuple[str, Optional[str]]:
    """Return (path, warning). Prefer SKILL.md; else dir + warning."""
    skill_md = os.path.join(skill_dir, 'SKILL.md')
    if os.path.isfile(skill_md):
        return skill_md, None
    return skill_dir, 'SKILL.md missing — using directory.'


def run_skills(root: str) -> int:
    items = scan_items(root, dirs_only=False)
    sel = select_items(
        items,
        prompt='Select skill: ',
        noun='skill',
        recent=0,
        show_sections=False,
    )
    if sel is None:
        return 1

    # If user picked a file directly, use it; if dir, resolve SKILL.md
    target = sel.item.path
    warning = None
    if os.path.isdir(target):
        target, warning = resolve_skill_target(target)

    if warning:
        present(style(warning, THEME['error']))

    if sel.action:
        emit_run(target, sel.action)
        return 0

    emit_copied(target)
    return 0


# ── html ─────────────────────────────────────────────────────────────────────

def list_top_html(directory: str) -> List[str]:
    names: List[str] = []
    try:
        with os.scandir(directory) as it:
            for entry in it:
                if entry.name.startswith('.'):
                    continue
                if not entry.name.lower().endswith('.html'):
                    continue
                try:
                    if entry.is_file(follow_symlinks=True):
                        names.append(entry.name)
                except OSError:
                    continue
    except FileNotFoundError:
        return []
    names.sort(key=str.lower)
    return names


def read_hint(directory: str) -> Optional[str]:
    hint_path = os.path.join(directory, HINT_NAME)
    try:
        with open(hint_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
    except (FileNotFoundError, OSError):
        return None
    if not content:
        return None
    name = content.splitlines()[0].strip()
    if not name or name.startswith('.') or '/' in name or '\\' in name:
        return None
    candidate = os.path.join(directory, name)
    if os.path.isfile(candidate) and name.lower().endswith('.html'):
        return name
    return None


def write_hint(directory: str, filename: str) -> None:
    path = os.path.join(directory, HINT_NAME)
    try:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(filename + '\n')
    except OSError as e:
        present(style(f'hint write failed: {e}', THEME['error']))


def resolve_html_in_dir(directory: str) -> Optional[str]:
    """Resolve effective HTML file path inside a report directory.

    Order: index.html → valid .hint → single .html → mini-select (2+).
    Always persists .hint when resolving a non-index file.
    No index.html symlink — browsers deref file:// symlinks and break relatives.
    """
    index = os.path.join(directory, 'index.html')
    if os.path.isfile(index):
        return index

    htmls = list_top_html(directory)

    hinted = read_hint(directory)
    if hinted and hinted in htmls:
        return os.path.join(directory, hinted)

    if len(htmls) == 0:
        present(style('No HTML files found.', THEME['error']))
        return None

    if len(htmls) == 1:
        write_hint(directory, htmls[0])
        return os.path.join(directory, htmls[0])

    # 2+ ambiguous — mini selector (filenames only)
    sel = select_filenames(
        htmls,
        base_dir=directory,
        prompt='Select HTML: ',
        noun='file',
    )
    if sel is None:
        return None
    write_hint(directory, sel.item.name)
    return sel.item.path


def _html_root_items(root: str) -> List[Item]:
    """Dirs and top-level .html files only."""
    out: List[Item] = []
    for it in scan_items(root, dirs_only=False):
        if os.path.isdir(it.path) or it.name.lower().endswith('.html'):
            out.append(it)
    return out


def run_html(root: str) -> int:
    sel = select_items(
        _html_root_items(root),
        prompt='Select html: ',
        noun='item',
        recent=5,
        show_sections=True,
    )
    if sel is None:
        return 1

    path = sel.item.path
    if os.path.isdir(path):
        resolved = resolve_html_in_dir(path)
        if not resolved:
            return 1
        target = resolved
    elif path.lower().endswith('.html') and os.path.isfile(path):
        target = path
    else:
        present(style('Not an HTML target.', THEME['error']))
        return 1

    if sel.action:
        emit_run(target, sel.action)
        return 0

    emit_copied(target)
    return 0


# ── CLI ──────────────────────────────────────────────────────────────────────

def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(description='pathfuncs select actions')
    p.add_argument('kind', choices=('skills', 'html'))
    p.add_argument('root')
    args = p.parse_args(argv)

    if args.kind == 'skills':
        return run_skills(args.root)
    return run_html(args.root)


if __name__ == '__main__':
    sys.exit(main())
