ttc() {
  local src="${1:-}"
  if [[ -z "$src" ]]; then
    echo "usage: ttc /path/to/font.ttc" >&2
    return 2
  fi
  if [[ ! -f "$src" ]]; then
    echo "ttc: file not found: $src" >&2
    return 1
  fi

  python3 - "$src" <<'PY'
import os
import sys
from fontTools.ttLib import TTCollection

src = sys.argv[1]
out_dir = os.path.join(os.getcwd(), 'extracted')
os.makedirs(out_dir, exist_ok=True)

ttc = TTCollection(src)

def best_name(ttfont):
  name = ttfont['name']
  # Try PostScript name first (nameID 6), then Full name (4)
  for nid in (6, 4):
    for platform, enc, lang in ((3, 1, 0x409), (1, 0, 0)):
      try:
        s = name.getName(nid, platform, enc, lang)
        if s:
          return str(s).replace('/', '-')
      except Exception:
        pass
  return None

for i, font in enumerate(ttc.fonts):
  base = best_name(font) or f'HelveticaNeue-{i}'
  path = os.path.join(out_dir, f'{base}.ttf')
  font.save(path)
  print(f'{i}: {path}')
PY
}