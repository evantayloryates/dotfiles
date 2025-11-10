#!/usr/bin/env python3
import os
import tempfile
from typing import Dict, Any, List

# --- CONFIG ---
CONFIG = [
  {
    'slug': 'amp',
    'path': '/Users/taylor/src/github/amplify',
    'default': 'cursor',
    'commands': {},
  },
  {
    'slug': 'd',
    'path': '/Users/taylor/Desktop',
    'default': 'cd',
    'commands': {},
  },
  {
    'slug': 'hb',
    'path': '/Users/taylor/src/github/heartbeat',
    'default': 'cursor',
    'commands': {},
  },
]

def build_function(entry: Dict[str, Any]) -> str:
  slug = entry['slug']
  path = entry['path']
  default = entry.get('default', 'cd')
  commands = entry.get('commands', {})
  aliases: List[str] = entry.get('aliases', [])

  fn = [
    f'{slug}() {{',
    '  local subcmd="$1"',
    '  if [[ $# -gt 0 ]]; then shift; fi',
    '  local args="$@"',
    '  case "$subcmd" in'
  ]

  for name, cmd in commands.items():
    cmd_str = (
      cmd.replace('<path>', path)
         .replace('<args>', '"$args"')
    )
    fn.append(f'    {name})')
    fn.append(f'      {cmd_str}')
    fn.append('      ;;')

  fn.append('    "" )')
  if default in commands:
    fn.append(f'      "$0" "{default}" "$@"')
  else:
    fn.append(f'      {default} "{path}"')
  fn.extend([
    '      ;;',
    '    * )',
    f'      $subcmd "{path}" "$@"',
    '      ;;',
    '  esac',
    '}'
  ])

  # Generate alias redirect functions
  alias_funcs = []
  for alias in aliases:
    alias_funcs.append(
      f'{alias}() {{ {slug} "$@"; }}'
    )

  return '\n'.join([*fn, '', *alias_funcs])


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
