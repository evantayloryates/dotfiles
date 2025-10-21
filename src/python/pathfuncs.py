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
    },
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
  {
    'slug': 'kit',
    'path': '/Users/taylor/.config/kitty/',
    'default': 'reload',
    'commands': {
      'reload': 'kitty @ load-config /Users/taylor/.config/kitty/kitty.conf'
    },
  },
  {
    'slug': 'dot',
    'path': '/Users/taylor/dotfiles',
    'default': 'cursor',
    'commands': {},
  },
  {
    'slug': 'dot-old',
    'path': '/Users/taylor/.dotfiles',
    'default': 'cursor',
    'commands': {},
  },
  {
    'slug': 'gh',
    'path': '/Users/taylor/src/github',
    'default': 'cd',
    'commands': {},
  },
  {
    'slug': 'nex',
    'path': '/Users/taylor/src/github/nexrender-scripts',
    'default': 'ssh',
    'commands': {
      'ssh': 'ssh -t -i ~/.ssh/aws-eb ec2-user@54.191.27.27 "export TERM=xterm; cd /Users/ec2-user/taylor; exec \$SHELL -l -i"',
    },
  },
  {
    'slug': 'notes',
    'path': '/Users/taylor/Desktop/notes',
    'default': 'cursor',
    'commands': {},
  },
  {
    'slug': 'pathfuncs',
    'path': '/Users/taylor/dotfiles/src/python/pathfuncs.py',
    'default': 'subl',
    'commands': {},
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
    cmd_str = (
      cmd.replace('<path>', path)
         .replace('<args>', '"$args"')
    )
    fn.append(f'    {name})')
    fn.append(f'      {cmd_str}')
    fn.append('      ;;')

  # --- Default case ---
  fn.append('    "" )')
  if default in commands:
    # default is a defined subcommand -> re-enter same function
    fn.append(f'      "$0" "{default}" "$@"')
  else:
    # default is an external command -> apply to path
    fn.append(f'      {default} "{path}"')
  fn.extend([
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
