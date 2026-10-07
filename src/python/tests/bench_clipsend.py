"""Opt-in macOS bridge benchmark; only private pasteboards and temporary files.

python3 -B src/python/tests/bench_clipsend.py --baseline-ref bc7562c
No third-party packages. Includes osascript startup and read/write costs; shell
naming and pbcopy are excluded. Fixtures are synthetic 1920x1080 UI and noise.
"""
import argparse
import json
from pathlib import Path
import random
import statistics
import struct
import subprocess
import tempfile
import time
import uuid

REPO = Path(__file__).resolve().parents[3]


def bmp_fixture(path, textured=False):
    width, height = 1920, 1080
    if textured:
        pixels = random.Random(42).randbytes(width * height * 3)
    else:
        rows = []
        for y in range(height):
            background = b'\x25\x20\x1e' * width
            if y % 28 < 13:
                bar = b'\xb0\xb0\xb0' * (300 + (y // 28 * 73) % 1400)
                background = background[:120] + bar + background[120 + len(bar):]
            rows.append(background)
        pixels = b''.join(rows)
    # 24-bit uncompressed BMP; width*3 is aligned to four bytes.
    header = struct.pack('<2sIHHI', b'BM', 54 + len(pixels), 0, 0, 54)
    header += struct.pack('<IiiHHIIiiII', 40, width, height, 1, 24, 0, len(pixels), 2835, 2835, 0, 0)
    path.write_bytes(header + pixels)


ADAPTER = r'''
function run(argv) {
  const pb = $.NSPasteboard.pasteboardWithName(argv[0]);
  if (argv[1] === 'setup') {
    const rep = $.NSBitmapImageRep.imageRepWithData($.NSData.dataWithContentsOfFile(argv[2]));
    const data = rep.representationUsingTypeProperties(Number(argv[3]), $({NSImageCompressionFactor: 0.85}));
    pb.clearContents; pb.setDataForType(data, argv[4]);
    return String(data.length);
  }
  if (argv[1] === 'setup-text') {
    const data = $.NSData.dataWithContentsOfFile(argv[2]);
    pb.clearContents; pb.setDataForType(data, 'public.utf8-plain-text');
    return String(data.length);
  }
  if (argv[1] === 'release') { pb.releaseGlobally; return 'ok'; }
  if (argv[1] === 'inspect') return inspect(pb);
  if (argv[1] === 'write') return writeImage(pb, argv[2], argv[3]);
  if (argv[1] === 'capture') return capture(pb, argv[2], argv[3]);
}
'''


def invoke(script, *args):
    return subprocess.run(['/usr/bin/osascript', '-l', 'JavaScript', str(script), *map(str, args)],
                          text=True, capture_output=True, check=True, timeout=30).stdout.strip()


def measure_pair(old, new, rounds):
    old()
    new()  # warmup outside samples
    samples = [[], []]
    for i in range(rounds):
        # Interleave and alternate to limit bias from startup/cache/load changes.
        for index in ([0, 1] if i % 2 == 0 else [1, 0]):
            start = time.perf_counter()
            (old, new)[index]()
            samples[index].append((time.perf_counter() - start) * 1000)
    return [{'median_ms': round(statistics.median(values), 1),
             'max_ms': round(max(values), 1)} for values in samples]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-ref', default='bc7562c')
    parser.add_argument('--rounds', type=int, default=9)
    args = parser.parse_args()
    if args.rounds < 1:
        parser.error('--rounds must be positive')
    current = (REPO / 'src/javascript/clipsend-pasteboard.js').read_text()
    baseline = subprocess.run(['git', 'show', args.baseline_ref + ':src/javascript/clipsend-pasteboard.js'],
                              cwd=REPO, text=True, capture_output=True, check=True).stdout
    results = []
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        scripts = []
        for label, source in [('baseline', baseline), ('capture', current)]:
            script = root / (label + '.js')
            script.write_text(source.replace('function run(argv)', 'function originalRun(argv)') + ADAPTER)
            scripts.append(script)
        for fixture in ['ui', 'texture']:
            bmp = root / (fixture + '.bmp')
            bmp_fixture(bmp, textured=fixture == 'texture')
            for source_fmt, target_fmt, code in [('png', 'png', 4), ('jpeg', 'png', 3), ('jpeg', 'jpeg', 3)]:
                board = 'clipsend-bench-' + str(uuid.uuid4())
                try:
                    size = int(invoke(scripts[1], board, 'setup', bmp, code, 'public.' + source_fmt))
                    def old():
                        if invoke(scripts[0], board, 'inspect') != 'image':
                            raise RuntimeError('baseline did not select image')
                        invoke(scripts[0], board, 'write', root / 'old-image', target_fmt)
                    def new():
                        if invoke(scripts[1], board, 'capture', root / 'new-image', target_fmt) != 'image':
                            raise RuntimeError('capture did not select image')
                    old_time, new_time = measure_pair(old, new, args.rounds)
                    row = {'fixture': fixture, 'source': source_fmt, 'target': target_fmt,
                           'bytes': size, 'rounds': args.rounds,
                           'baseline': old_time, 'capture': new_time}
                    if target_fmt == source_fmt:
                        if (root / 'old-image').read_bytes() != (root / 'new-image').read_bytes():
                            raise RuntimeError('matching-format bytes changed')
                    results.append(row)
                    print(json.dumps(row), flush=True)
                finally:
                    invoke(scripts[1], board, 'release')
        for size in [64, 5 * 1024 * 1024]:
            text = root / 'text-input'
            text.write_bytes((b'ordinary clipboard text\n' * (size // 24 + 1))[:size])
            board = 'clipsend-bench-' + str(uuid.uuid4())
            try:
                invoke(scripts[1], board, 'setup-text', text)
                def old_text():
                    if invoke(scripts[0], board, 'inspect') != 'text':
                        raise RuntimeError('baseline did not select text')
                def new_text():
                    if invoke(scripts[1], board, 'capture', root / 'text-output', 'png') != 'text':
                        raise RuntimeError('capture did not select text')
                old_time, new_time = measure_pair(old_text, new_text, args.rounds)
                if (root / 'text-output').read_bytes() != text.read_bytes():
                    raise RuntimeError('text bytes changed')
                row = {'fixture': 'text', 'bytes': size, 'rounds': args.rounds,
                       'baseline_inspect_only': old_time, 'capture_and_write': new_time}
                results.append(row)
                print(json.dumps(row), flush=True)
            finally:
                invoke(scripts[1], board, 'release')
    return results


if __name__ == '__main__':
    main()
