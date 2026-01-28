import re
import sys

COPIER_RE = re.compile(r'^_[a-z][a-z0-9_]*\s*\(\)')

def main():
  copiers_path = sys.argv[1]

  with open(copiers_path, 'r') as f:
    lines = f.read().splitlines()

  copier_lines = [line for line in lines if COPIER_RE.match(line)]

  for line in copier_lines:
    sys.stdout.write(f'{line}\n')

if __name__ == '__main__':
  main()
