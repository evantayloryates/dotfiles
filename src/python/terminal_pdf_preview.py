#!/usr/bin/env python3
"""Compose a width-aware, transparent PDF contact strip for terminal display."""

from concurrent.futures import ThreadPoolExecutor
import fcntl
from io import BytesIO
import math
from pathlib import Path
import re
import subprocess
import struct
import sys
import termios

from PIL import Image, ImageDraw, ImageFont


TARGET_HEIGHT = 400  # logical pixels; multiply by the current display scale
MIN_HEIGHT = 300
MAX_HEIGHT = 650
PAGE_GAP = 15
EDGE_PADDING = 15
HEADER_HEIGHT = 32
HEADER_TOP_PADDING = 10
HEADER_FONT_SIZE = 14
OMISSION_WIDTH = 24
MIN_PAGE_SLOT = 100
CELL_WIDTH = 10.0  # Chafa's fallback pixel width per terminal column
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"


def page_geometry(source):
    summary = subprocess.run(["pdfinfo", str(source)], capture_output=True, text=True,
                             check=True).stdout
    count_match = re.search(r"^Pages:\s+(\d+)", summary, re.M)
    if not count_match or int(count_match.group(1)) < 1:
        raise ValueError("PDF has no pages")
    count = int(count_match.group(1))
    details = subprocess.run(["pdfinfo", "-f", "1", "-l", str(count), str(source)],
                             capture_output=True, text=True, check=True).stdout
    sizes = {int(n): (float(w), float(h)) for n, w, h in re.findall(
        r"^Page\s+(\d+) size:\s+([\d.]+) x ([\d.]+) pts", details, re.M)}
    rotations = {int(n): int(degrees) for n, degrees in re.findall(
        r"^Page\s+(\d+) rot:\s+(\d+)", details, re.M)}
    if len(sizes) != count:
        raise ValueError("Could not read every PDF page size")
    aspects = {}
    for page, (width, height) in sizes.items():
        if width <= 0 or height <= 0:
            raise ValueError(f"Invalid size for page {page}")
        if rotations.get(page, 0) % 180:
            width, height = height, width
        aspects[page] = width / height
    return aspects, rotations


def strip_width(selected, aspects, height):
    pages = sorted(selected)
    omissions = sum(right - left > 1 for left, right in zip(pages, pages[1:]))
    omissions += pages[-1] < len(aspects)
    items = len(pages) + omissions
    return (sum(max(MIN_PAGE_SLOT, math.ceil(aspects[page] * height)) for page in pages)
            + omissions * OMISSION_WIDTH + max(0, items - 1) * PAGE_GAP)


def terminal_cell_width(scale):
    try:
        _, columns, pixels, _ = struct.unpack(
            "HHHH", fcntl.ioctl(0, termios.TIOCGWINSZ, b"\0" * 8))
        logical_width = pixels / columns / scale
        if 6 <= logical_width <= 20:
            return logical_width
    except (OSError, ValueError, ZeroDivisionError):
        pass
    return CELL_WIDTH


def max_fitting_height(selected, aspects, budget):
    if strip_width(selected, aspects, MIN_HEIGHT) > budget:
        return None
    low, high = MIN_HEIGHT, MAX_HEIGHT
    while low < high:
        middle = (low + high + 1) // 2
        if strip_width(selected, aspects, middle) <= budget:
            low = middle
        else:
            high = middle - 1
    return low


def plan_pages(aspects, columns, cell_width=CELL_WIDTH):
    count = len(aspects)
    # One spare terminal cell prevents the Kitty placement from wrapping.
    budget = max(1, columns - 1) * cell_width - 2 * EDGE_PADDING
    if count == 1:
        height = max_fitting_height({1}, aspects, budget)
        return [1], height if height is not None else min(
            MAX_HEIGHT, max(1, int(budget / aspects[1])))
    first_and_last = {1, count}
    if max_fitting_height(first_and_last, aspects, budget) is None:
        # Narrow panes cannot show both ends legibly. Keep the first page and
        # its omission marker; only go below 300 when even that cannot fit.
        selected = {1}
        height = max_fitting_height(selected, aspects, budget)
        if height is None:
            height = max(1, int((budget - OMISSION_WIDTH - PAGE_GAP)
                                / aspects[1]))
        return [1], min(height, MAX_HEIGHT)

    selected = first_and_last
    candidates = [(sorted(selected), max_fitting_height(selected, aspects, budget))]
    for page in (2, count - 1):
        if page not in selected:
            trial = selected | {page}
            height = max_fitting_height(trial, aspects, budget)
            if height is not None:
                selected = trial
                candidates.append((sorted(selected), height))
    if 2 in selected:
        for page in range(3, count - 1):
            if page in selected:
                continue
            trial = selected | {page}
            height = max_fitting_height(trial, aspects, budget)
            if height is None:
                break
            selected = trial
            candidates.append((sorted(selected), height))

    # Each candidate uses its largest fitting pages, so right-side slack is
    # minimized. Favor the 400-pixel guide, with a modest reward for an extra
    # page when its size remains comparable.
    return min(candidates, key=lambda candidate: (
        abs(candidate[1] - TARGET_HEIGHT) - 12 * min(len(candidate[0]), 6),
        -candidate[1], -len(candidate[0])))


def render_page(source, page, height_px, rotated):
    scale_options = (["-scale-to-x", str(height_px), "-scale-to-y", "-1"]
                     if rotated else ["-scale-to-x", "-1", "-scale-to-y", str(height_px)])
    raster = subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page),
                             "-singlefile", *scale_options, str(source)],
                            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    with Image.open(BytesIO(raster.stdout)) as image:
        return page, image.convert("RGBA")


def compose(source, selected, rotations, count, height, scale):
    gap = PAGE_GAP * scale
    header = HEADER_HEIGHT * scale
    marker_width = OMISSION_WIDTH * scale
    font = ImageFont.truetype(FONT, HEADER_FONT_SIZE * scale)
    small_font = ImageFont.truetype(FONT, 13 * scale)
    with ThreadPoolExecutor(max_workers=min(4, len(selected))) as pool:
        images = dict(pool.map(lambda page: render_page(
            source, page, height * scale, rotations.get(page, 0) % 180 != 0),
                               selected))
    pieces = []
    previous = None
    for page in selected:
        if previous is not None and page - previous > 1:
            pieces.append(("omitted", page - previous - 1))
        pieces.append(("page", page))
        previous = page
    if selected[-1] < count:
        pieces.append(("omitted", count - selected[-1]))
    slot_widths = {page: max(image.width, MIN_PAGE_SLOT * scale)
                   for page, image in images.items()}
    width = (sum(slot_widths[value] if kind == "page" else marker_width
                 for kind, value in pieces) + gap * (len(pieces) - 1)
             + 2 * EDGE_PADDING * scale)
    max_height = max(image.height for image in images.values())
    canvas = Image.new("RGBA", (width, header + max_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    x = EDGE_PADDING * scale
    for kind, value in pieces:
        if kind == "page":
            page_image = images[value]
            slot_width = slot_widths[value]
            label = f"Page {value}"
            label_width = draw.textbbox((0, 0), label, font=font)[2]
            draw.text((x + (slot_width - label_width) / 2,
                       HEADER_TOP_PADDING * scale),
                      label, fill="white", font=font)
            canvas.alpha_composite(page_image,
                                   (x + (slot_width - page_image.width) // 2, header))
            x += slot_width + gap
        else:
            label = f"{value} pages omitted" if value != 1 else "1 page omitted"
            box = small_font.getbbox(label)
            text_image = Image.new("RGBA", (box[2] - box[0] + 2 * scale,
                                            box[3] - box[1] + 2 * scale))
            ImageDraw.Draw(text_image).text((scale - box[0], scale - box[1]), label,
                                            font=small_font, fill=(180, 180, 180, 255))
            rotated = text_image.rotate(90, expand=True)  # bottom to top
            y = header + max(0, (max_height - rotated.height) // 2)
            canvas.alpha_composite(rotated, (x + (marker_width - rotated.width) // 2, y))
            x += marker_width + gap
    output = BytesIO()
    canvas.save(output, format="PNG", compress_level=1)
    return output.getvalue()


def main():
    source = Path(sys.argv[1]).resolve()
    scale = max(1, min(3, int(sys.argv[2])))
    columns = max(3, int(sys.argv[3]))
    aspects, rotations = page_geometry(source)
    selected, height = plan_pages(aspects, columns, terminal_cell_width(scale))
    sys.stdout.buffer.write(compose(source, selected, rotations, len(aspects), height, scale))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"PDF preview failed: {exc}", file=sys.stderr)
        sys.exit(1)
