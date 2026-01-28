import re
import sys

COPIER_RE = re.compile(r'^(_[a-z0-9_-]+) {0,5}\( {0,5}\) {0,5}\{')

def main():
  copiers_path = sys.argv[1]

  with open(copiers_path, 'r') as f:
    lines = f.read().splitlines()

  for line in lines:
    m = COPIER_RE.match(line)
    if m:
      name = m.group(1)  # e.g. "_cache"
      sys.stdout.write(f'{name}\n')

if __name__ == '__main__':
  main()
