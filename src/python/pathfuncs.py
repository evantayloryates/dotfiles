#!/usr/bin/env python3
import os
import tempfile
import json
import re
from typing import Dict, Any, List

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
    'aliases': [],  # optional: array of POSIX-compliant alias names
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
    'aliases': ['dotfiles', 'df', '_myDotFiles'],  # example valid aliases
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
      'ssh': '/Users/taylor/src/github/nexrender-scripts/scripts/local/ssh',
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
  {
    'slug': 'kit',
    'path': '/Users/taylor/.config/kitty',
    'default': 'cd',
    'commands': {},
  },
]

def is_valid_alias_name(alias: str) -> bool:
  """
  Validate POSIX-compliant alias name.
  Valid characters: a-z, A-Z, 0-9, _
  Must start with a letter or underscore (cannot start with a number)
  """
  if not alias:
    return False
  # Must start with letter or underscore, followed by any combination of letters, digits, underscores
  pattern = r'^[a-zA-Z_][a-zA-Z0-9_]*$'
  return bool(re.match(pattern, alias))

def validate_aliases(entry: Dict[str, Any]) -> List[str]:
  """
  Validate and filter aliases for an entry.
  Returns list of valid aliases, logs warnings for invalid ones.
  """
  aliases = entry.get('aliases', [])
  if not aliases:
    return []
  
  valid_aliases = []
  slug = entry['slug']
  
  for alias in aliases:
    if is_valid_alias_name(alias):
      valid_aliases.append(alias)
    else:
      print(f"Warning: Invalid alias name '{alias}' for slug '{slug}' - skipping", flush=True)
  
  return valid_aliases

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

def build_alias_function(alias: str, slug: str) -> str:
  """
  Build a function for an alias that redirects to the original slug's function.
  """
  fn = [
    f'{alias}() {{',
    f'  {slug} "$@"',
    '}'
  ]
  return '\n'.join(fn)

def main():
  # Generate all main functions
  all_functions = []
  
  for entry in CONFIG:
    # Build main function
    all_functions.append(build_function(entry))
    
    # Build alias functions
    valid_aliases = validate_aliases(entry)
    slug = entry['slug']
    for alias in valid_aliases:
      all_functions.append(build_alias_function(alias, slug))
  
  # Join all functions
  functions = '\n\n'.join(all_functions)

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
