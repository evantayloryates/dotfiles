#!/usr/bin/env python3
import os
import tempfile

HOME = '/Users/taylor'

# path macros
def p(slug, path, default='cursor', commands=None, aliases=None):
  if path.startswith('~'):
    path = HOME + path[1:]
  entry = {'slug': slug, 'path': path, 'default': default, 'commands': commands or {}}
  if aliases:
    entry['aliases'] = aliases
  return entry


CONFIG = [
  p('amp',        '~/src/github/amplify', aliases=['amplify'], commands={
    'disable': 'safemv <path>/.git/hooks/pre-commit <path>/.git/hooks/pre-commit.disabled && echo "pre-commit disabled" || echo "failed to disable"',
    'enable': 'safemv <path>/.git/hooks/pre-commit.disabled <path>/.git/hooks/pre-commit && echo "pre-commit enabled" || echo "failed to enable"',
    'prod': "_sb_prod",
    'stage': "_sb_stage",
  }),
  p('app',         '/Applications',                     'open'), # TODO: link all app dirs /Applications, /System/Applications, /System/Applications/Utilities, /System/Library/CoreServices/Applications/ 
  p('d',           '~/Desktop',                         'cd',  aliases=['desk', 'desktop']),
  p('dot-old',     '~/.dotfiles'),
  p('dot',         '~/dotfiles'),
  p('down',        '~/Downloads',                       'cd'),
  p('gh',          '~/src/github',                      'cd'),
  p('hb',          '~/src/github/heartbeat',            aliases=['heartbeat', 'heart']),
  p('kit',         '~/.config/kitty/',                  aliases=['kitty'], commands={'reload': '/Applications/kitty.app/Contents/MacOS/kitty @ load-config /Users/taylor/.config/kitty/kitty.conf'}),
  p('mac',         '~/src/macos',                       'cursor', aliases=['macos']),
  p('mesh',        '~/src/github/mesh'),
  p('nex',         '~/src/github/nexrender-scripts',    'ssh', commands={'ssh': '/Users/taylor/src/github/nexrender-scripts/scripts/local/ssh'}),
  p('notes',       '~/Desktop/notes'),
  p('pathfuncs',   '~/dotfiles/src/python/pathfuncs.py','cursor', aliases=['pathfunc', 'pathfns', 'pathfn', 'pathfuns', 'pathfun', 'pthfuncs', 'pthfunc', 'pthfns', 'pthfn', 'pthfuns', 'pthfun', 'pfuncs', 'pfunc', 'pfns', 'pfn', 'pfuns', 'pfun' ]),
  p('spot',        '~/hush-spotlight', 'select',
    aliases=['spotlight'],
    commands={
      'select': 'spotlight_select_action',
      'a': 'spotlight_add_exclusions',
      'add': 'spotlight_add_exclusions',
      'c': 'spotlight_clean_exclusions',
      'clean': 'spotlight_clean_exclusions',
      'h': 'spotlight_add_exclusions',
      'hush': 'spotlight_add_exclusions',
      'l': 'spotlight_list_exclusions',
      'list': 'spotlight_list_exclusions',
      'ls': 'spotlight_list_exclusions',
      'setup': 'spotlight_setup_index_suppression',
      'suppress': 'spotlight_setup_index_suppression',
      's': 'spotlight_setup_index_suppression',
      'w': 'spotlight_watch_exclusions',
      'watch': 'spotlight_watch_exclusions',
    },
  ),
  p('s',           '~/src',                            ' cd'),
  p('screenshots', '~/Pictures/Screenshots',            'open', aliases=['ss', 'shots', 'screenshot']),
]

def build_function(entry):
  slug = entry['slug']
  path = entry['path']
  default = entry.get('default', 'cd')
  commands = entry.get('commands', {})
  aliases = entry.get('aliases', [])

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

  alias_funcs = [f'{alias}() {{ {slug} "$@"; }}' for alias in aliases]

  return '\n'.join([*fn, '', *alias_funcs])


def build_paths_helper(config):
  slugs = sorted(entry['slug'] for entry in config)
  lines = ['paths() {']
  for slug in slugs:
    lines.append(f'  echo "{slug}"')
  lines.append('}')
  return '\n'.join(lines)


def main():
  functions = '\n\n'.join(build_function(entry) for entry in CONFIG)
  paths_helper = build_paths_helper(CONFIG)

  fd, path = tempfile.mkstemp(prefix='pathfuncs_', suffix='.zsh')
  with os.fdopen(fd, 'w') as f:
    f.write('# Generated shell functions\n\n')
    f.write(functions)
    f.write('\n\n')
    f.write(paths_helper)
    f.write('\n')

  print(path)


if __name__ == '__main__':
  main()
