import re
import sys

COPIER_RE = re.compile(r'^(_[a-z0-9][a-z0-9_-]*) {0,5}\( {0,5}\) {0,5}\{')

def main():
  copiers_path = sys.argv[1]

  with open(copiers_path, 'r') as f:
    lines = f.read().splitlines()

  for line in lines:
    m = COPIER_RE.match(line)
    if m:
      sys.stdout.write(f'{m.group(1)}\n')

if __name__ == '__main__':
  main()
