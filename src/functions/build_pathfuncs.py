#!/usr/bin/env python3
import os
import tempfile
import json
from typing import Dict, Any

# --- CONFIG ---
CONFIG = [
  {
    'slug': 'amp',
    'path': '/Users/taylor/src/github/amplify',
    'default': 'cursor',
    'commands': {
      # 'ls': 'ls -AGhlo <path> ; echo "<args>"' # allows for fine tuning commands here
    }
  },
  {
    'slug': 's',
    'path': '/Users/taylor/src',
    'default': 'cd',
    'commands': {},
  },
]


def build_function(entry: Dict[str, Any]) -> str:
  slug = entry['slug']
  path = entry['path']
  default = entry.get('default', 'cd')
  commands = entry.get('commands', {})

  fn = [
    f'{slug}() {{',
    '  local subcmd="$1"',
    '  if [[ $# -gt 0 ]]; then shift; fi',
    '  local args="$@"',
    '  case "$subcmd" in'
  ]

  for name, cmd in commands.items():
    # replace placeholders with dynamic references
    cmd_str = (
      cmd.replace('<path>', path)
         .replace('<args>', '"$args"')
    )

    fn.append(f'    {name})')
    fn.append(f'      {cmd_str}')
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
  # join all generated functions
  functions = '\n\n'.join(build_function(entry) for entry in CONFIG)

  # write to temp file
  fd, path = tempfile.mkstemp(prefix='pathfuncs_', suffix='.zsh')
  with os.fdopen(fd, 'w') as f:
    f.write('# Generated shell functions\n\n')
    f.write(functions)
    f.write('\n')

  # print filepath so zshrc can source it
  print(path)


if __name__ == '__main__':
  main()
