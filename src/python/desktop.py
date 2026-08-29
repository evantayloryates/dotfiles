#!/usr/bin/env python3
"""Arrange the primary macOS desktop: folders left, files right.

Both groups are ordered by creation date and packed into the icon grid a column
at a time. Folders start at the top-left corner and march inward, filling only
the top sixteen rows of each column; files start at the top-right and march
inward to meet them, using whole columns. Two sets of folders are exempt and
sit alphabetically in blocks anchored to the bottom of a column: a named list
in the first, anything ending in a star in the second. Symlinks are judged by
what they point at, so a link to a directory sorts as a folder and uses the
target's creation date.

Cost model, measured on a 145-icon desktop under macOS 26:

    scan ~/Desktop metadata     ~0.3 ms   (filesystem)
    osascript process start      ~25 ms
    read every name + position  ~450 ms   (one round trip)
    write one icon position      ~8.4 ms  (per icon)
    verification read          ~450 ms   (only after writes or when requested)

Two facts shape the design. Finder is roughly a thousand times more expensive
than the filesystem, so every fact that `os.scandir` can supply comes from
there and Finder is asked only for icon positions, which nothing else knows.
And a position write costs a flat 8.4 ms that no batching escapes — Finder
rejects list-specifier sets, and reaching items by index is eight times slower
than by name — so the only lever left is writing fewer icons. The desired
layout is therefore diffed against the live one and only genuinely misplaced
icons are touched, which collapses an already-tidy desktop to a single read.

A no-op run is one Apple Event round trip. A changed run adds a write and a
verification read. Grid calibration is cached separately and is scoped to the
primary display; treating Finder's multi-display coordinate space as one
rectangular grid produces bogus one-pixel pitches.
"""
from __future__ import annotations

import argparse
from collections import Counter
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

# Folders that always live in the same place, exempt from the creation-date
# ordering: each set forms an alphabetical block anchored to the bottom of one
# column. Named folders hold the leftmost column, starred ones the next.
PINNED_FOLDERS = frozenset({
    'Documents', 'Downloads', 'Fonts', 'Library', 'Movies', 'Music',
    'Pictures', 'Screenshots',
})
STARRED_SUFFIX = '\N{GLOWING STAR}'

# Rows a folder column uses before wrapping to the next one. Stopping short of
# the full grid height keeps the dated folders clear of the pinned block and
# leaves a blank row between the two.
FOLDER_COLUMN_DEPTH = 16

# Share of icons that must sit off the cached lattice before we assume the grid
# itself changed rather than a few icons having been dragged loose.
_RECALIBRATE_FRACTION = 0.2

# Cache format version. Version 1 could accept a corrupt 1- or 2-pixel lattice
# forever because every integer coordinate appears to be on such a grid.
_CACHE_VERSION = 2

# A real Finder grid cannot pack icon anchors more tightly than the icon
# itself. This also gives cache validation a hard lower bound independent of
# how many icons happen to be on the Desktop.
_MIN_ICON_SIZE = 16


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


class Frame(NamedTuple):
    """A display rectangle in Finder's top-left-origin coordinate space."""

    origin: Point
    size: Rect

    @property
    def right(self) -> int:
        return self.origin.x + self.size.width

    @property
    def bottom(self) -> int:
        return self.origin.y + self.size.height

    def contains(self, pos: Point) -> bool:
        return (
            self.origin.x <= pos.x < self.right
            and self.origin.y <= pos.y < self.bottom
        )


class Screen(NamedTuple):
    frame: Frame
    visible: Frame
    primary: bool


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
    screens: List[Screen]

    def positions(self) -> Dict[str, Point]:
        return {i.name: i.pos for i in self.items}

    def primary_screen(self) -> Screen:
        try:
            return next(screen for screen in self.screens if screen.primary)
        except StopIteration as exc:
            raise DesktopError('macOS did not report a primary display') from exc


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
    """Displays, icon view settings and every icon position, in one trip.

    Everything Finder is asked for over a normal run is gathered here, because
    the round trip dominates and a second one would roughly double the cost.
    AppKit reports screens bottom-up while Finder reports icon positions
    top-down, so display rectangles are converted before leaving JXA.
    """
    raw = _jxa(
        'ObjC.import("AppKit");\n'
        'const w = F.desktop.window, b = w.bounds(), o = w.iconViewOptions;\n'
        'const n = F.desktop.items.name(), p = F.desktop.items.desktopPosition();\n'
        'const screens = $.NSScreen.screens.js;\n'
        'const frames = screens.map(s => ObjC.deepUnwrap(s.frame));\n'
        'const visible = screens.map(s => ObjC.deepUnwrap(s.visibleFrame));\n'
        'const primary = frames.findIndex(f => f.origin.x === 0 && f.origin.y === 0);\n'
        'const primaryIndex = primary >= 0 ? primary : 0;\n'
        'const referenceTop = frames[primaryIndex].origin.y + '
        'frames[primaryIndex].size.height;\n'
        'const topDown = r => [r.origin.x, '
        'referenceTop - r.origin.y - r.size.height, '
        'r.size.width, r.size.height];\n'
        'JSON.stringify({\n'
        '  bounds: [b.width, b.height],\n'
        '  view: [o.iconSize(), String(o.arrangement()), String(o.labelPosition())],\n'
        '  items: n.map((name, i) => [name, p[i].x, p[i].y]),\n'
        '  screens: frames.map((f, i) => ({\n'
        '    frame: topDown(f), visible: topDown(visible[i]), '
        'primary: i === primaryIndex,\n'
        '  })),\n'
        '})'
    )

    def frame(values) -> Frame:
        x, y, width, height = (int(v) for v in values)
        return Frame(Point(x, y), Rect(width, height))

    return Snapshot(
        bounds=Rect(int(raw['bounds'][0]), int(raw['bounds'][1])),
        view='|'.join(str(v) for v in raw['view']),
        items=[DesktopItem(n, Point(int(x), int(y))) for n, x, y in raw['items']],
        screens=[Screen(frame(s['frame']), frame(s['visible']), bool(s['primary']))
                 for s in raw['screens']],
    )


def apply_moves(moves: Sequence[tuple], clean: bool = False) -> List[str]:
    """Write every position in one round trip; return the names that failed.

    Each write is its own Apple Event no matter how they are issued, so the
    only thing batching saves is process startup — but a stale name would
    otherwise abort the run partway, hence the per-item catch.

    The caller normally leaves ``clean`` false. Every managed icon receives an
    exact lattice position, while a window-wide Finder Clean Up can also touch
    unmanaged icons or icons on another display.
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

def _axis_step(values: Sequence[int], minimum: int) -> int:
    """Slot pitch along one axis from positions known to have been snapped."""
    lines = sorted(set(values))
    if len(lines) < 2:
        raise DesktopError('not enough icons on the desktop to measure the grid')
    step = 0
    for a, b in zip(lines, lines[1:]):
        step = math.gcd(step, b - a)
    if step < minimum:
        raise DesktopError(
            f'implausible {step}px grid spacing (minimum is {minimum}px)'
        )
    return step


def _probe_many(name: str, targets: Sequence[Point]) -> List[Point]:
    """Snap one borrowed icon at several targets, then restore it exactly.

    Probe results, unlike the existing Desktop, are known to have gone through
    Finder's current snapping logic. The original position is restored without
    another clean-up pass so calibration cannot tidy or relocate user state as
    a side effect.
    """
    payload = json.dumps([[p.x, p.y] for p in targets])
    landed = _jxa(
        f'const it = F.desktop.items.byName({json.dumps(name)});\n'
        f'const targets = {payload};\n'
        'const original = it.desktopPosition();\n'
        'const result = [];\n'
        'try {\n'
        '  for (const target of targets) {\n'
        '    it.desktopPosition = {x: target[0], y: target[1]};\n'
        '    F.cleanUp(F.desktop.window);\n'
        '    const p = it.desktopPosition();\n'
        '    result.push([p.x, p.y]);\n'
        '  }\n'
        '} finally {\n'
        '  it.desktopPosition = original;\n'
        '}\n'
        'JSON.stringify(result)'
    )
    return [Point(int(x), int(y)) for x, y in landed]


def _spread(start: int, end: int, count: int) -> List[int]:
    if count <= 1 or start == end:
        return [start]
    return [round(start + (end - start) * i / (count - 1))
            for i in range(count)]


def _probe_targets(screen: Screen, icon_size: int) -> tuple[List[Point], int]:
    """Targets that exercise both axes and several points along every edge."""
    visible = screen.visible
    pad = max(1, icon_size // 2)
    left, right = visible.origin.x + pad, visible.right - pad
    top, bottom = visible.origin.y + pad, visible.bottom - pad
    if left >= right or top >= bottom:
        raise DesktopError('primary display has no usable Desktop area')

    middle_x = (left + right) // 2
    middle_y = (top + bottom) // 2
    horizontal = [Point(x, middle_y) for x in _spread(left, right, 13)]
    vertical = [Point(middle_x, y) for y in _spread(top, bottom, 21)]

    # A populated edge cell can push a probe to its neighbour. Sampling the
    # edge at multiple cross-axis positions makes it very unlikely that every
    # edge observation is blocked, and occupied icons are added as corroborating
    # evidence below.
    xs = _spread(left, right, 5)[1:-1]
    ys = _spread(top, bottom, 5)[1:-1]
    edges = [Point(left, y) for y in ys] + [Point(right, y) for y in ys]
    edges += [Point(x, top) for x in xs] + [Point(x, bottom) for x in xs]
    return horizontal + vertical + edges, len(horizontal)


def _mode_remainder(values: Sequence[int], step: int) -> int:
    if not values:
        raise DesktopError('could not determine grid alignment')
    return Counter(v % step for v in values).most_common(1)[0][0]


def measure_grid(snap: Snapshot, probe_name: Optional[str] = None) -> Grid:
    """Measure the primary display's slot lattice with an actively snapped icon.

    Finder exposes one Desktop item collection across every display, but each
    display has its own origin, extent and sometimes scale. Mixing their icon
    coordinates makes a GCD-based pitch collapse to one or two pixels. Active
    samples are therefore filtered to the primary display before inferring the
    lattice; existing icons on that display only corroborate its edges.
    """
    if not snap.items:
        raise DesktopError('no icons on the desktop to measure the grid')
    probe = next((i for i in snap.items if i.name == probe_name), snap.items[0])
    screen = snap.primary_screen()
    try:
        icon_size = max(_MIN_ICON_SIZE, int(snap.view.split('|', 1)[0]))
    except (ValueError, IndexError):
        icon_size = _MIN_ICON_SIZE

    targets, horizontal_count = _probe_targets(screen, icon_size)
    probed = _probe_many(probe.name, targets)
    horizontal = [p for p in probed[:horizontal_count]
                  if screen.frame.contains(p)]
    vertical = [p for p in probed[horizontal_count:horizontal_count + 21]
                if screen.frame.contains(p)]
    samples = [p for p in probed if screen.frame.contains(p)]
    minimum = max(_MIN_ICON_SIZE, icon_size)
    step = Point(
        _axis_step([p.x for p in horizontal], minimum),
        _axis_step([p.y for p in vertical], minimum),
    )

    x_phase = _mode_remainder([p.x for p in horizontal], step.x)
    y_phase = _mode_remainder([p.y for p in vertical], step.y)
    aligned = [i.pos for i in snap.items
               if screen.frame.contains(i.pos)
               and i.pos.x % step.x == x_phase
               and i.pos.y % step.y == y_phase]
    evidence = samples + aligned
    xs = [p.x for p in evidence if p.x % step.x == x_phase]
    ys = [p.y for p in evidence if p.y % step.y == y_phase]
    if not xs or not ys:
        raise DesktopError('could not determine primary display grid extent')

    origin = Point(min(xs), min(ys))
    last_x, last_y = max(xs), max(ys)
    return Grid(
        origin=origin,
        step=step,
        cols=(last_x - origin.x) // step.x + 1,
        rows=(last_y - origin.y) // step.y + 1,
    )


def _signature(snap: Snapshot) -> str:
    screens = ';'.join(
        f'{s.frame.origin.x},{s.frame.origin.y},'
        f'{s.frame.size.width}x{s.frame.size.height}/'
        f'{s.visible.origin.x},{s.visible.origin.y},'
        f'{s.visible.size.width}x{s.visible.size.height}'
        for s in snap.screens
    )
    return f'{snap.view}|{screens}'


def _read_cache(signature: str) -> Optional[Grid]:
    try:
        with open(CACHE_PATH, encoding='utf-8') as f:
            cached = json.load(f)
        if (cached.get('version') != _CACHE_VERSION
                or cached.get('signature') != signature):
            return None
        g = cached['grid']
        grid = Grid(Point(*g['origin']), Point(*g['step']), g['cols'], g['rows'])
        if (grid.step.x < _MIN_ICON_SIZE or grid.step.y < _MIN_ICON_SIZE
                or grid.cols < 1 or grid.rows < 1):
            return None
        return grid
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _write_cache(signature: str, grid: Grid) -> None:
    try:
        os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
        with open(CACHE_PATH, 'w', encoding='utf-8') as f:
            json.dump({
                'version': _CACHE_VERSION,
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
    in hand, whereas re-measuring temporarily probes Finder's current grid.
    """
    signature = _signature(snap)
    if not refresh:
        grid = _read_cache(signature)
        if grid is not None:
            primary = snap.primary_screen().frame
            last = grid.point_at(Cell(grid.cols - 1, grid.rows - 1))
            if primary.contains(grid.origin) and primary.contains(last):
                on_primary = [i for i in snap.items if primary.contains(i.pos)]
                stray = sum(1 for i in on_primary if not grid.on_lattice(i.pos))
                if stray <= max(3, _RECALIBRATE_FRACTION * len(on_primary)):
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

def _alpha(entry: Entry):
    return entry.name.casefold()


def _by_date(entry: Entry):
    return entry.created, entry.name


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


def is_starred(name: str) -> bool:
    """True for names ending in the star, with or without a variation selector.

    The same emoji arrives with a trailing U+FE0F from some pickers, which a
    bare endswith would silently miss.
    """
    return name.rstrip('\ufe0e\ufe0f').endswith(STARRED_SUFFIX)


def group_folders(entries: Sequence[Entry], newest_first: bool = False):
    """Split folders into the two pinned blocks and the date-ordered remainder."""
    folders = [e for e in entries if e.is_folder]
    pinned = sorted((e for e in folders if e.name in PINNED_FOLDERS), key=_alpha)
    starred = sorted((e for e in folders
                      if e.name not in PINNED_FOLDERS and is_starred(e.name)),
                     key=_alpha)
    fixed = {e.name for e in pinned} | {e.name for e in starred}
    dated = sorted((e for e in folders if e.name not in fixed),
                   key=_by_date, reverse=newest_first)
    return pinned, starred, dated


def _pin_block(grid: Grid, column: int, block: Sequence[Entry],
               taken: Set[Cell], plan: Dict[str, Cell]) -> None:
    """Park `block` against the foot of `column`, in the order given.

    Anchoring at the bottom means the block grows and shrinks upward while its
    last row stays put. These cells are claimed outright, before anything else
    is placed, so a pinned folder holds its slot wherever it started.
    """
    if column >= grid.cols:
        return
    block = block[-grid.rows:]
    for offset, entry in enumerate(block):
        cell = Cell(column, grid.rows - len(block) + offset)
        plan[entry.name] = cell
        taken.add(cell)


def plan_layout(entries: Sequence[Entry], grid: Grid, reserved: Set[Cell],
                newest_first: bool = False) -> Dict[str, Cell]:
    """Assign every entry a grid cell.

    Four groups, laid down in order. The two pinned blocks take fixed
    alphabetical runs at the feet of the first and second columns. The
    remaining folders run by creation date from the top-left, sixteen rows per
    column, marching right. Files run by creation date from the top-right, full
    columns, marching left to meet them.

    Ordering by creation date ascending is also the cheapest to maintain — a
    newly created item sorts to the end of its group and displaces nothing,
    so the next run rewrites one icon instead of shuffling the whole desktop.
    """
    pinned, starred, dated = group_folders(entries, newest_first)
    files = sorted((e for e in entries if not e.is_folder),
                   key=_by_date, reverse=newest_first)

    plan: Dict[str, Cell] = {}
    taken = set(reserved)

    _pin_block(grid, 0, pinned, taken, plan)
    _pin_block(grid, 1, starred, taken, plan)

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

    if not entries:
        for name in missing:
            print(style(f'not drawn by Finder yet, skipped: {name}', THEME['error']))
        if missing:
            return 1
        print('desktop has no files or folders to arrange')
        return 0

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

    pinned, starred, dated = group_folders(entries)
    files = len(entries) - len(pinned) - len(starred) - len(dated)
    head = (f'{len(dated)} folders from top-left, {len(pinned)} pinned and '
            f'{len(starred)} starred at the column feet, {files} files from '
            f'top-right ({grid.cols}x{grid.rows} grid)')

    if dry_run:
        print(head)
        print(f'would move {len(moves)} of {len(entries)} icons')
        for name, pos in moves[:20]:
            print(style(f'  {name} -> {tuple(grid.cell_at(pos))}', THEME['dim']))
        if len(moves) > 20:
            print(style(f'  ... {len(moves) - 20} more', THEME['dim']))
        return 0

    write_at = time.perf_counter()
    failed = apply_moves(moves) if moves else []
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

    wrong: List[str] = []
    if verify or moves:
        after = snapshot().positions()
        wrong = [n for n, cell in plan.items()
                 if after.get(n) != grid.point_at(cell)]
        # Finder can occasionally miss a position write while refreshing the
        # Desktop. One focused retry is cheap and avoids leaving a partial
        # arrangement that still exits successfully.
        if wrong:
            retry = [(n, grid.point_at(plan[n])) for n in wrong]
            apply_moves(retry)
            after = snapshot().positions()
            wrong = [n for n, cell in plan.items()
                     if after.get(n) != grid.point_at(cell)]
        if wrong:
            for name in wrong:
                print(style(f'could not place: {name}', THEME['error']))
            print(style(f'{len(wrong)} icon(s) not where planned, '
                        f'starting with {wrong[0]!r}', THEME['error']))
            return 1
        print(style('verified: every icon is on its planned slot', THEME['dim']))

    return 1 if missing else 0


# ── CLI ──────────────────────────────────────────────────────────────────────

def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(description='arrange the macOS desktop')
    p.add_argument('command', nargs='?', default='clean', choices=('clean', 'grid'))
    p.add_argument('--newest-first', action='store_true',
                   help='put the newest items at the top instead of the oldest')
    p.add_argument('-n', '--dry-run', action='store_true',
                   help='show what would move without touching anything')
    p.add_argument('--verify', action='store_true',
                   help='verify even when no icons need moving')
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
