import re
import subprocess
import sys

COPIER_RE = re.compile(r'^(_[a-z0-9](?:[a-z0-9]*(_[a-z0-9]+)*)?) {0,5}\( {0,5}\) {0,5}\{')

def extract_copiers(copiers_path):
  with open(copiers_path, 'r') as f:
    lines = f.read().splitlines()

  copiers = []
  for line in lines:
    m = COPIER_RE.match(line)
    if m:
      copier_fn = {
        'fn': m.group(1),
        'variants': [],
      }
      copiers.append(copier_fn)
  return copiers

def eval_command(command):
  result = subprocess.run(
    ['/bin/zsh', '-lc', command],
    capture_output=True,
    text=True,
    check=True,
  )
  return result.stdout

def eval_copier_fn(copiers_path, copier_fn):
  cmd = (
    f'source {sh_quote(copiers_path)}; '
    f'{sh_quote(copier_fn)}; '
    f'/usr/bin/pbpaste; '
    f': | /usr/bin/pbcopy'
  )
  result = eval_command(cmd)
  return result.stdout



def sh_quote(s):
  # minimal safe single-quote wrapper for shell strings
  return "'" + s.replace("'", "'\\''") + "'"
  
def main():
  copiers_path = sys.argv[1]

  copiers = extract_copiers(copiers_path)

  for copier in copiers:
    copier_name = copier['fn']
    # write to stdout: copier_name
    sys.stdout.write(f"{copier_name}\n")

  # products = []
  # for copier_fn in copiers:
  #   value = eval_copier_fn(copiers_path, fn)
  #   products.append((fn, value))

  # for fn, value in products:
  #   sys.stdout.write(f"{fn}\n ↳ {value}\n")

if __name__ == '__main__':
  main()
