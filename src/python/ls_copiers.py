import re
import subprocess
import sys

COPIER_RE = re.compile(r'^(_[a-z0-9][a-z0-9_-]*) {0,5}\( {0,5}\) {0,5}\{')

def extract_copier_fns(copiers_path):
  with open(copiers_path, 'r') as f:
    lines = f.read().splitlines()

  copier_fns = []
  for line in lines:
    m = COPIER_RE.match(line)
    if m:
      copier_fns.append(m.group(1))
  return copier_fns

def eval_copier_fn(copiers_path, copier_fn):
  cmd = (
    f'source {sh_quote(copiers_path)}; '
    f'{sh_quote(copier_fn)}; '
    f'/usr/bin/pbpaste; '
    f': | /usr/bin/pbcopy'
  )

  result = subprocess.run(
    ['/bin/zsh', '-lc', cmd],
    capture_output=True,
    text=True,
    check=True,
  )
  return result.stdout


def sh_quote(s):
  # minimal safe single-quote wrapper for shell strings
  return "'" + s.replace("'", "'\\''") + "'"
  
def main():
  copiers_path = sys.argv[1]

  copier_fns = extract_copier_fns(copiers_path)

  products = []
  for fn in copier_fns:
    value = eval_copier_fn(copiers_path, fn)
    products.append((fn, value))

  for fn, value in products:
    sys.stdout.write(f"{fn}\n ↳ {value}\n")

if __name__ == '__main__':
  main()
