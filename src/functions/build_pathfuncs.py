#!/usr/bin/env python3
import os
import tempfile
import json

# --- CONFIG ---
CONFIG = [
  {
    'slug': 'amp',
    'path': '/Users/taylor/src/github/amplify',
    'default': 'cd',
    'commands': {
      'ls': 'ls -AGhlo <path> | grep'
    }
  },
  {
    'slug': 'space',
    'path': '/Users/taylor/src/github/spaceback',
    'default': 'cd',
    'commands': {
      'ls': 'ls -AGhlo <path> | grep'
    }
  }
]

def build_function(entry: dict) -> str:
  slug = entry['slug']
  path = entry['path']
  default = entry.get('default', 'cd')
  commands = entry.get('commands', {})

  fn = [f'{slug}() {{',
        '  local subcmd="$1"',
        '  shift || true',
        '  case "$subcmd" in']

  for name, cmd in commands.items():
    cmd_str = cmd.replace('<path>', path)
    fn.append(f'    {name})')
    fn.append(f'      {cmd_str} "$@"')
    fn.append('      ;;')

  fn.extend([
    '    "" )',
    f'      {default} "{path}"',
    '      ;;',
    '    * )',
    f'      $subcmd "{path}" "$@"',
    '      ;;',
    '  esac',
    '}'
  ])

  return '\n'.join(fn)


def main():
  functions = '\n\n'.join(build_function(entry) for entry in CONFIG)
  fd, path = tempfile.mkstemp(prefix='pathfuncs_', suffix='.zsh')
  with os.fdopen(fd, 'w') as f:
    f.write('# Generated shell functions\n\n')
    f.write(functions)
    f.write('\n')
  print(path)


if __name__ == '__main__':
  main()
