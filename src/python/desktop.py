#!/usr/bin/env python3
"""Arrange the macOS desktop: folders down the left, files down the right.

Both groups are ordered by creation date and packed into the icon grid a column
at a time. Folders start at the top-left corner and march inward, filling only
the top eighteen rows of each column; files start at the top-right and march
inward to meet them, using whole columns. A short list of pinned folders is
exempt, sitting alphabetically in a block anchored to the bottom of the
leftmost column. Symlinks are judged by what they point at, so a link to a
directory sorts as a folder and uses the target's creation date.

Cost model, measured on a 145-icon desktop under macOS 26:

    scan ~/Desktop metadata     ~0.3 ms   (filesystem)
    osascript process start      ~25 ms
    read every name + position  ~450 ms   (one round trip)
    write one icon position      ~8.4 ms  (per icon)
    clean up                     ~10 ms

Two facts shape the design. Finder is roughly a thousand times more expensive
than the filesystem, so every fact that `os.scandir` can supply comes from
there and Finder is asked only for icon positions, which nothing else knows.
And a position write costs a flat 8.4 ms that no batching escapes — Finder
rejects list-specifier sets, and reaching items by index is eight times slower
than by name — so the only lever left is writing fewer icons. The desired
layout is therefore diffed against the live one and only genuinely misplaced
icons are touched, which collapses an already-tidy desktop to a single read.

That leaves two Apple Event round trips for a normal run: one to read the
desktop, one to write the diff and snap the result to the grid.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import time
from typing import Dict, Iterable, List, NamedTuple, Optional, Sequence, Set

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from dir_selector import style, THEME  # noqa: E402

DESKTOP = os.path.expanduser('~/Desktop')
CACHE_PATH = os.path.expanduser('~/.cache/dotfiles/desktop_grid.json')

# Directories macOS presents as single files. Finder calls these packages; the
# filesystem calls them directories, and the user sees files.
PACKAGE_SUFFIXES = frozenset({
    '.app', '.appex', '.bundle', '.download', '.framework', '.fcpbundle',
    '.kext', '.mpkg', '.photoslibrary', '.pkg', '.plugin', '.prefpane',
    '.qlgenerator', '.rtfd', '.saver', '.scptd', '.sparsebundle', '.workflow',
    '.xcodeproj',
})

# Folders that always live in the same place: an alphabetical block anchored to
# the bottom of the leftmost column, exempt from the creation-date ordering.
PINNED_FOLDERS = frozenset({
    'Documents', 'Downloads', 'Fonts', 'Library', 'Movies', 'Music',
    'Pictures', 'Screenshots',
})

# Rows a folder column uses before wrapping to the next one. Stopping short of
# the full grid height keeps the dated folders clear of the pinned block and
# leaves a blank row between the two.
FOLDER_COLUMN_DEPTH = 16

# Share of icons that must sit off the cached lattice before we assume the grid
# itself changed rather than a few icons having been dragged loose.
_RECALIBRATE_FRACTION = 0.2


class DesktopError(RuntimeError):
    pass


# ── geometry ─────────────────────────────────────────────────────────────────

class Point(NamedTuple):
    x: int
    y: int


class Cell(NamedTuple):
    col: int
    row: int


class Rect(NamedTuple):
    width: int
    height: int


class DesktopItem(NamedTuple):
    name: str
    pos: Point


class Entry(NamedTuple):
    """A ~/Desktop directory entry, classified as the user sees it."""

    name: str
    is_folder: bool
    created: float


class Snapshot(NamedTuple):
    bounds: Rect
    view: str
    items: List[DesktopItem]

    def positions(self) -> Dict[str, Point]:
        return {i.name: i.pos for i in self.items}


class Grid(NamedTuple):
    """Slot lattice of the desktop, in Finder's desktop-position coordinates."""

    origin: Point
    step: Point
    cols: int
    rows: int

    def point_at(self, cell: Cell) -> Point:
        return Point(
            self.origin.x + cell.col * self.step.x,
            self.origin.y + cell.row * self.step.y,
        )

    def cell_at(self, pos: Point) -> Cell:
        return Cell(
            round((pos.x - self.origin.x) / self.step.x),
            round((pos.y - self.origin.y) / self.step.y),
        )

    def contains(self, cell: Cell) -> bool:
        return 0 <= cell.col < self.cols and 0 <= cell.row < self.rows

    def on_lattice(self, pos: Point) -> bool:
        return (
            (pos.x - self.origin.x) % self.step.x == 0
            and (pos.y - self.origin.y) % self.step.y == 0
        )


def items_near(items: Iterable[DesktopItem], grid: Grid, cell: Cell) -> List[DesktopItem]:
    """Items sorted by distance from `cell`, nearest first.

    Nothing stops two icons from sharing a slot, so callers asking "what is at
    this cell" get a ranked list rather than a single answer.
    """
    anchor = grid.point_at(cell)
    return sorted(items, key=lambda i: math.hypot(i.pos.x - anchor.x, i.pos.y - anchor.y))


# ── Finder bridge ────────────────────────────────────────────────────────────

def _jxa(body: str):
    """Run a JXA snippet with `F` bound to Finder; parse its stdout as JSON."""
    script = f'const F = Application("Finder");\n{body}'
    proc = subprocess.run(
        ['/usr/bin/osascript', '-l', 'JavaScript', '-e', script],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise DesktopError(proc.stderr.strip() or 'osascript failed')
    out = proc.stdout.strip()
    return json.loads(out) if out else None


def snapshot() -> Snapshot:
    """Desktop bounds, icon view settings and every icon position, in one trip.

    Everything Finder is asked for over a normal run is gathered here, because
    the round trip dominates and a second one would roughly double the cost.
    """
    raw = _jxa(
        'const w = F.desktop.window, b = w.bounds(), o = w.iconViewOptions;\n'
        'const n = F.desktop.items.name(), p = F.desktop.items.desktopPosition();\n'
        'JSON.stringify({\n'
        '  bounds: [b.width, b.height],\n'
        '  view: [o.iconSize(), String(o.arrangement()), String(o.labelPosition())],\n'
        '  items: n.map((name, i) => [name, p[i].x, p[i].y]),\n'
        '})'
    )
    return Snapshot(
        bounds=Rect(int(raw['bounds'][0]), int(raw['bounds'][1])),
        view='|'.join(str(v) for v in raw['view']),
        items=[DesktopItem(n, Point(int(x), int(y))) for n, x, y in raw['items']],
    )


def apply_moves(moves: Sequence[tuple], clean: bool = True) -> List[str]:
    """Write every position in one round trip; return the names that failed.

    Each write is its own Apple Event no matter how they are issued, so the
    only thing batching saves is process startup — but a stale name would
    otherwise abort the run partway, hence the per-item catch.
    """
    if not moves and not clean:
        return []
    payload = json.dumps([[name, pos.x, pos.y] for name, pos in moves])
    failed = _jxa(
        f'const moves = {payload};\n'
        'const items = F.desktop.items;\n'
        'const failed = [];\n'
        'for (const m of moves) {\n'
        '  try { items.byName(m[0]).desktopPosition = {x: m[1], y: m[2]}; }\n'
        '  catch (e) { failed.push(m[0]); }\n'
        '}\n'
        f'{"F.cleanUp(F.desktop.window);" if clean else ""}\n'
        'JSON.stringify(failed)'
    )
    return failed or []


def find(items: Sequence[DesktopItem], name: str) -> DesktopItem:
    for item in items:
        if item.name == name:
            return item
    raise DesktopError(f'no desktop item named {name!r}')


# ── grid measurement ─────────────────────────────────────────────────────────

def _axis_step(values: Sequence[int]) -> int:
    """Slot pitch along one axis: the GCD of gaps between occupied lines."""
    lines = sorted(set(values))
    if len(lines) < 2:
        raise DesktopError('not enough icons on the desktop to measure the grid')
    step = 0
    for a, b in zip(lines, lines[1:]):
        step = math.gcd(step, b - a)
    if step <= 0:
        raise DesktopError('could not determine grid spacing')
    return step


def _probe(name: str, pos: Point) -> Point:
    """Park an icon at `pos`, let clean up clamp it onto the grid, report where."""
    landed = _jxa(
        f'const it = F.desktop.items.byName({json.dumps(name)});\n'
        f'it.desktopPosition = {{x: {pos.x}, y: {pos.y}}};\n'
        'F.cleanUp(F.desktop.window);\n'
        'const p = it.desktopPosition();\n'
        'JSON.stringify([p.x, p.y])'
    )
    return Point(int(landed[0]), int(landed[1]))


def measure_grid(snap: Snapshot, probe_name: Optional[str] = None) -> Grid:
    """Measure the slot lattice, briefly borrowing one icon as a test probe.

    Pitch comes from icons Finder has already snapped. The extent comes from
    parking the probe outside the grid and letting clean up clamp it back in.

    Clamping lands on the nearest *free* slot, so a probe alone under-reports a
    crowded edge — it would call an occupied top-left corner row one. Every
    icon already sitting on the desktop proves its own slot exists, though, so
    the two sources are combined: the extremes of the lattice are the furthest
    point either the probe or an existing icon can vouch for. Between them they
    cover both a packed desktop and a nearly empty one.
    """
    if not snap.items:
        raise DesktopError('no icons on the desktop to measure the grid')

    step = Point(
        _axis_step([i.pos.x for i in snap.items]),
        _axis_step([i.pos.y for i in snap.items]),
    )

    probe = next((i for i in snap.items if i.name == probe_name), snap.items[0])
    near = _probe(probe.name, Point(0, 0))
    far = _probe(probe.name, Point(snap.bounds.width, snap.bounds.height))
    _probe(probe.name, probe.pos)

    xs = [i.pos.x for i in snap.items]
    ys = [i.pos.y for i in snap.items]
    origin = Point(min([near.x] + xs), min([near.y] + ys))
    last_x = max([far.x] + xs)
    last_y = max([far.y] + ys)
    return Grid(
        origin=origin,
        step=step,
        cols=(last_x - origin.x) // step.x + 1,
        rows=(last_y - origin.y) // step.y + 1,
    )


def _signature(snap: Snapshot) -> str:
    return f'{snap.bounds.width}x{snap.bounds.height}|{snap.view}'


def _read_cache(signature: str) -> Optional[Grid]:
    try:
        with open(CACHE_PATH, encoding='utf-8') as f:
            cached = json.load(f)
        if cached.get('signature') != signature:
            return None
        g = cached['grid']
        return Grid(Point(*g['origin']), Point(*g['step']), g['cols'], g['rows'])
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _write_cache(signature: str, grid: Grid) -> None:
    try:
        os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
        with open(CACHE_PATH, 'w', encoding='utf-8') as f:
            json.dump({
                'signature': signature,
                'grid': {
                    'origin': list(grid.origin),
                    'step': list(grid.step),
                    'cols': grid.cols,
                    'rows': grid.rows,
                },
            }, f, indent=2)
    except OSError:
        pass


def load_grid(snap: Snapshot, refresh: bool = False,
              probe_name: Optional[str] = None) -> Grid:
    """Cached lattice, re-measured only when the desktop geometry changes.

    The cache key covers screen size and icon view settings, but Finder does
    not publish grid spacing, so the cached lattice is also checked against the
    snapshot: if most icons no longer sit on it, the geometry moved underneath
    us and it is re-measured. That check is free, since it reads data already
    in hand, whereas re-measuring costs three round trips.
    """
    signature = _signature(snap)
    if not refresh:
        grid = _read_cache(signature)
        if grid is not None:
            stray = sum(1 for i in snap.items if not grid.on_lattice(i.pos))
            if stray <= max(3, _RECALIBRATE_FRACTION * len(snap.items)):
                return grid

    grid = measure_grid(snap, probe_name)
    _write_cache(signature, grid)
    return grid


# ── desktop contents ─────────────────────────────────────────────────────────

def _is_folder(entry: os.DirEntry) -> bool:
    if os.path.splitext(entry.name)[1].lower() in PACKAGE_SUFFIXES:
        return False
    try:
        return entry.is_dir(follow_symlinks=True)
    except OSError:
        return False


def _created(entry: os.DirEntry) -> float:
    """Creation time, following symlinks so a link reports its target's age."""
    try:
        st = entry.stat(follow_symlinks=True)
    except OSError:
        st = entry.stat(follow_symlinks=False)
    return getattr(st, 'st_birthtime', st.st_mtime)


def scan_entries() -> List[Entry]:
    """Everything in ~/Desktop that Finder draws, with kind and creation date."""
    entries: List[Entry] = []
    with os.scandir(DESKTOP) as it:
        for e in it:
            if e.name.startswith('.'):
                continue
            entries.append(Entry(e.name, _is_folder(e), _created(e)))
    return entries


# ── layout ───────────────────────────────────────────────────────────────────

def _columns_fill(columns: Iterable[int], depth: int, queue: List[Entry],
                  taken: Set[Cell], plan: Dict[str, Cell]) -> List[Entry]:
    """Pour `queue` down `depth` rows of each column; return what did not fit."""
    pending = iter(queue)
    current = next(pending, None)
    for col in columns:
        for row in range(depth):
            if current is None:
                return []
            cell = Cell(col, row)
            if cell in taken:
                continue
            plan[current.name] = cell
            taken.add(cell)
            current = next(pending, None)
    return ([current] if current is not None else []) + list(pending)


def plan_layout(entries: Sequence[Entry], grid: Grid, reserved: Set[Cell],
                newest_first: bool = False) -> Dict[str, Cell]:
    """Assign every entry a grid cell.

    Three groups, laid down in order. Pinned folders take a fixed alphabetical
    block at the foot of the leftmost column. The remaining folders run by
    creation date from the top-left, eighteen rows per column, marching right.
    Files run by creation date from the top-right, full columns, marching left
    to meet them.

    Ordering by creation date ascending is also the cheapest to maintain — a
    newly created item sorts to the end of its group and displaces nothing,
    so the next run rewrites one icon instead of shuffling the whole desktop.
    """
    def order(e: Entry):
        return e.created, e.name

    folders = [e for e in entries if e.is_folder]
    pinned = sorted((e for e in folders if e.name in PINNED_FOLDERS),
                    key=lambda e: e.name.casefold())[-grid.rows:]
    dated = sorted((e for e in folders if e.name not in PINNED_FOLDERS),
                   key=order, reverse=newest_first)
    files = sorted((e for e in entries if not e.is_folder),
                   key=order, reverse=newest_first)

    plan: Dict[str, Cell] = {}
    taken = set(reserved)

    # Anchored to the bottom, so the block grows and shrinks upward and its
    # last row never moves. These cells are claimed outright: a pinned folder
    # holds its slot regardless of what else is sitting there.
    for offset, entry in enumerate(pinned):
        cell = Cell(0, grid.rows - len(pinned) + offset)
        plan[entry.name] = cell
        taken.add(cell)

    spilled = _columns_fill(range(grid.cols), min(FOLDER_COLUMN_DEPTH, grid.rows),
                            dated, taken, plan)
    spilled += _columns_fill(range(grid.cols - 1, -1, -1), grid.rows,
                             files, taken, plan)
    if spilled:
        raise DesktopError(
            f'desktop grid is full: {len(spilled)} item(s) have nowhere to go, '
            f'starting with {spilled[0].name!r}'
        )
    return plan


def reserved_cells(snap: Snapshot, grid: Grid, managed: Set[str]) -> Set[Cell]:
    """Cells held by icons we do not own — mounted volumes and the like."""
    cells = set()
    for item in snap.items:
        if item.name in managed:
            continue
        cell = grid.cell_at(item.pos)
        if grid.contains(cell):
            cells.add(cell)
    return cells


# ── the cleaning pass ────────────────────────────────────────────────────────

def clean_desktop(newest_first: bool = False, dry_run: bool = False,
                  refresh: bool = False, verify: bool = False) -> int:
    started = time.perf_counter()

    entries = scan_entries()
    read_at = time.perf_counter()
    snap = snapshot()

    # Finder is the authority on what is actually drawn; anything on disk it
    # has not picked up yet cannot be addressed by name.
    visible = {i.name for i in snap.items}
    missing = [e.name for e in entries if e.name not in visible]
    entries = [e for e in entries if e.name in visible]

    managed = {e.name for e in entries}
    # Calibration shoves its probe around, so lend it something we own rather
    # than a mounted volume that happens to sort first.
    grid = load_grid(snap, refresh=refresh,
                     probe_name=next(iter(sorted(managed)), None))
    read_s = time.perf_counter() - read_at

    plan = plan_layout(entries, grid, reserved_cells(snap, grid, managed), newest_first)

    current = snap.positions()
    moves = sorted(
        ((name, grid.point_at(cell)) for name, cell in plan.items()
         if current.get(name) != grid.point_at(cell)),
        key=lambda m: (m[1].x, m[1].y),
    )

    pinned = sum(1 for e in entries if e.is_folder and e.name in PINNED_FOLDERS)
    folders = sum(1 for e in entries if e.is_folder) - pinned
    head = (f'{folders} folders from top-left, {pinned} pinned bottom-left, '
            f'{len(entries) - folders - pinned} files from top-right '
            f'({grid.cols}x{grid.rows} grid)')

    if dry_run:
        print(head)
        print(f'would move {len(moves)} of {len(entries)} icons')
        for name, pos in moves[:20]:
            print(style(f'  {name} -> {tuple(grid.cell_at(pos))}', THEME['dim']))
        if len(moves) > 20:
            print(style(f'  ... {len(moves) - 20} more', THEME['dim']))
        return 0

    # Writes land icons on exact slots, so the snap pass only earns its round
    # trip when something is genuinely loose — which the snapshot already told
    # us, for free.
    loose = any(not grid.on_lattice(i.pos) for i in snap.items)
    write_at = time.perf_counter()
    failed = apply_moves(moves, clean=True) if moves or loose else []
    write_s = time.perf_counter() - write_at

    print(head)
    if moves:
        print(f'moved {len(moves) - len(failed)} of {len(entries)} icons')
    else:
        print('already arranged')
    print(style(f'{time.perf_counter() - started:.2f}s total '
                f'(read {read_s:.2f}s, write {write_s:.2f}s)', THEME['dim']))

    for name in missing:
        print(style(f'not drawn by Finder yet, skipped: {name}', THEME['error']))
    for name in failed:
        print(style(f'could not move: {name}', THEME['error']))

    if verify:
        after = snapshot().positions()
        wrong = [n for n, cell in plan.items()
                 if after.get(n) != grid.point_at(cell)]
        if wrong:
            print(style(f'{len(wrong)} icon(s) not where planned, '
                        f'starting with {wrong[0]!r}', THEME['error']))
            return 1
        print(style('verified: every icon is on its planned slot', THEME['dim']))

    return 1 if failed else 0


# ── CLI ──────────────────────────────────────────────────────────────────────

def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(description='arrange the macOS desktop')
    p.add_argument('command', nargs='?', default='clean', choices=('clean', 'grid'))
    p.add_argument('--newest-first', action='store_true',
                   help='put the newest items at the top instead of the oldest')
    p.add_argument('-n', '--dry-run', action='store_true',
                   help='show what would move without touching anything')
    p.add_argument('--verify', action='store_true',
                   help='re-read the desktop afterwards to confirm the layout')
    p.add_argument('--recalibrate', action='store_true', help='re-measure the grid')
    args = p.parse_args(argv)

    try:
        if args.command == 'grid':
            grid = load_grid(snapshot(), refresh=args.recalibrate)
            print(f'origin {tuple(grid.origin)}  step {tuple(grid.step)}  '
                  f'{grid.cols} cols x {grid.rows} rows')
            return 0
        return clean_desktop(
            newest_first=args.newest_first,
            dry_run=args.dry_run,
            refresh=args.recalibrate,
            verify=args.verify,
        )
    except DesktopError as e:
        print(style(str(e), THEME['error']), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
