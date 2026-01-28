import re
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

def main():
  copiers_path = sys.argv[1]

  copier_fns = extract_copier_fns(copiers_path)
  sys.stdout.write(f'{copier_fns}\n')
  

if __name__ == '__main__':
  main()
