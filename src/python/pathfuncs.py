#!/usr/bin/env python3
import os
import tempfile

HOME = '/Users/taylor'

# path macros
#
# Sub pathfuncs: an entry with parent_func='<slug>' is a standalone pathfunc that is
# only reachable through its parent (`skills claude`, `skills cc abs`). It gets no
# top-level function or aliases, so it never shadows a real command of the same name
# (claude, codex, cc). The parent must list it in sub_funcs; inside the parent, sub
# selectors win over the `<subcmd> <path>` fallthrough.
def p(slug, path, default='cd', commands=None, aliases=None, alias_cmds=None,
      sub_funcs=None, parent_func=None):
  if path.startswith('~'):
    path = HOME + path[1:]
  entry = {'slug': slug, 'path': path, 'default': default, 'commands': commands or {}}
  if aliases:
    entry['aliases'] = aliases
  if alias_cmds:
    entry['alias_cmds'] = alias_cmds
  if sub_funcs:
    entry['sub_funcs'] = sub_funcs
  if parent_func:
    entry['parent_func'] = parent_func
  return entry


KICKOFF_CONTAINER = 'code --folder-uri vscode-remote://ssh-remote+kickoff.devpod/workspaces'

CONFIG = [
  p('app',         '/Applications',                     'open'), # TODO: link all app dirs /Applications, /System/Applications, /System/Applications/Utilities, /System/Library/CoreServices/Applications/
  p('desktop',     '~/Desktop',                         'cd', aliases=['desk', 'Desktop'],
    commands={'clean': '__desk_clean <args>'}),
  p('documents',   '~/Documents',                       'cd', aliases=['docs', 'doc', 'Documents']),
  p('domputer',    '~/src/github/domputer',             'cd', aliases=['dom']),
  p('dotfiles',    '~/src/github/dotfiles',             'cd', aliases=['dot']),
  p('downloads',   '~/Downloads',                       'cd', aliases=['down', 'Downloads']),
  p('github',      '~/src/github',                      'cd', aliases=['ghb', 'gthb', 'ghub', 'gith']),
  p('html',        '~/src/docs/html',                   'select', aliases=['htm'],
    commands={'select': '__html_select <path>'}),
  p('ideas',       '~/Desktop/ideas',                   'cd'),
  p('joe',         '~/src/github/joe-airbrand',         'cd'),
  # `kickoff code` (and every alias) opens the dev container instead of the local folder.
  # Connect directly: `devpod up` reruns host-init and can remove the running DB.
  p('kickoff',     '~/src/github/kickoff',              'cd', aliases=['kick', 'kck'],
    commands={'code': KICKOFF_CONTAINER, 'container': KICKOFF_CONTAINER}),
  p('kit',         '~/.config/kitty/',                  aliases=['kitty'], commands={'reload': '/Applications/kitty.app/Contents/MacOS/kitty @ load-config /Users/taylor/.config/kitty/kitty.conf'}),
  p('library',     '~/Library',                         'cd', aliases=['lib', 'Library']),
  p('mac',         '~/src/macos',                       'cd', aliases=['macos']),
  p('movies',      '~/Movies',                          'cd', aliases=['mov', 'Movies']),
  p('music',       '~/Music',                           'cd', aliases=['Music']),
  p('notes',       '~/Desktop/notes'),
  p('pathfuncs',   '~/dotfiles/src/python/pathfuncs.py','code', aliases=['pathfunc', 'pathfns', 'pathfn', 'pathfuns', 'pathfun', 'pthfuncs', 'pthfunc', 'pthfns', 'pthfn', 'pthfuns', 'pthfun', 'pfuncs', 'pfunc', 'pfns', 'pfn', 'pfuns', 'pfun' ]),
  p('pictures',    '~/Pictures',                        'cd', aliases=['pics', 'pic', 'Pictures']),
  p('plans',       '~/src/docs/plans',                  'open', aliases=['pln', 'plan']),
  p('pod',         '~/src/github/podsauce',             'cd'),
  p('r1',          '~/src/github/r1',                   'cd', aliases=['rone', 'rem']),
  p('src',         '~/src',                             'cd', aliases=['s']),
  p('sca',         '~/src/github/r1/sca',               'cd'),
  p('screenshots', '~/Pictures/Screenshots',            'open', aliases=['ss', 'shots', 'screenshot']),
  p('skills',      '~/src/docs/skills',                 'select', aliases=['skl', 'skill'],
    commands={'select': '__skills_select <path>'}, sub_funcs=['claude', 'codex']),
  p('claude',      '~/.claude/skills',                  'cd', parent_func='skills', aliases=['cc']),
  p('codex',       '~/.codex/skills',                   'cd', parent_func='skills', aliases=['cdx', 'cod']),
  p('taxes',       '~/Documents/Taxes',                 'cd', aliases=['tax']),
  p('vsx',         '~/src/vscode-extensions'),
  p('amp',        '~/src/github/amplify', aliases=['amplify'], alias_cmds={'up': 'update'},
    commands={
      'disable': 'safemv <path>/.git/hooks/pre-commit <path>/.git/hooks/pre-commit.disabled && echo "pre-commit disabled" || echo "failed to disable"',
      'enable': 'safemv <path>/.git/hooks/pre-commit.disabled <path>/.git/hooks/pre-commit && echo "pre-commit enabled" || echo "failed to enable"',
      'exec': '__amplify_exec <args>',
      'logs': '__amplify_logs <args>',
      'log': '__amplify_logs <args>',
      'restart': '__amplify_restart <args>',
      'ssh': '__ssh_prod',
      'prod': '__ssh_prod',
      'stage': '__ssh_stage',
      'lint': '<path>/scripts/lint -A',
      'update': '__amplify_update <args>',
    }
  ),
  p('nex',         '~/src/github/nexrender-scripts',    'dev',
    commands={
      'dev'      : '/Users/taylor/src/github/nexrender-scripts/scripts/local/ssh',
      'get'      : '/Users/taylor/src/github/nexrender-scripts/scripts/local/get <args>',
      'ssh'      : 'make -C /Users/taylor/src/github/nexrender-api ssh',
      'vnc'      : 'make -C /Users/taylor/src/github/nexrender-api vnc',
      'pwd'      : 'make -C /Users/taylor/src/github/nexrender-api send-pwd',
      'password' : 'make -C /Users/taylor/src/github/nexrender-api send-pwd',
      'tmux'     : '/Users/taylor/src/github/nexrender-scripts/scripts/local/nex.sh',
    }
  ),
]

def fn_name(entry):
  if 'parent_func' in entry:
    return f"__{entry['parent_func']}__{entry['slug']}"
  return entry['slug']


def selectors(entry):
  return [entry['slug'], *entry.get('aliases', [])]


def validate(config):
  top = {e['slug']: e for e in config if 'parent_func' not in e}
  for entry in config:
    parent = entry.get('parent_func')
    if parent is None:
      continue
    slug = entry['slug']
    if parent not in top:
      raise SystemExit(f"pathfuncs: sub func '{slug}': parent_func '{parent}' is not a top-level pathfunc")
    if entry.get('sub_funcs'):
      raise SystemExit(f"pathfuncs: sub func '{slug}': nested sub_funcs are not supported")
    if slug not in top[parent].get('sub_funcs', []):
      raise SystemExit(f"pathfuncs: '{parent}' must list '{slug}' in sub_funcs")

  for parent in top.values():
    taken = {name: 'command' for name in [*parent['commands'], *parent.get('alias_cmds', {})]}
    for sub_slug in parent.get('sub_funcs', []):
      subs = [e for e in config if e.get('parent_func') == parent['slug'] and e['slug'] == sub_slug]
      if len(subs) != 1:
        raise SystemExit(f"pathfuncs: '{parent['slug']}' sub_funcs: expected exactly one "
                         f"p('{sub_slug}', ..., parent_func='{parent['slug']}'), found {len(subs)}")
      for name in selectors(subs[0]):
        if name in taken:
          raise SystemExit(f"pathfuncs: '{parent['slug']} {name}' is ambiguous: "
                           f"sub func '{sub_slug}' collides with {taken[name]}")
        taken[name] = f"sub func '{sub_slug}'"


def build_function(entry, subs=()):
  slug = fn_name(entry)
  path = entry['path']
  default = entry.get('default', 'cd')
  commands = entry.get('commands', {})
  is_sub = 'parent_func' in entry
  # Sub funcs are reachable only through their parent: no top-level names.
  aliases = [] if is_sub else entry.get('aliases', [])
  alias_cmds = entry.get('alias_cmds', {})

  fn = [
    f'{slug}() {{',
    '  local subcmd="$1"',
    '  if [[ $# -gt 0 ]]; then shift; fi',
    '  local args="$@"',
    '  case "$subcmd" in'
  ]

  # Sub func selectors come first so they beat the `* )` fallthrough, which would
  # otherwise run the same-named command (cc, claude, codex) against this path.
  for sub in subs:
    fn.append(f"    {'|'.join(selectors(sub))})")
    fn.append(f'      {fn_name(sub)} "$@"')
    fn.append('      ;;')

  for name, cmd in commands.items():
    cmd_str = (
      cmd.replace('<path>', path)
         .replace('<args>', '"$args"')
    )
    fn.append(f'    {name})')
    fn.append(f'      {cmd_str}')
    fn.append('      ;;')

  for name, subcmd in alias_cmds.items():
    fn.append(f'    {name})')
    fn.append(f'      {slug} "{subcmd}" "$@"')
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
  if not is_sub:
    alias_funcs += [
      f'{name}() {{ {slug} {subcmd} "$@"; }}' for name, subcmd in alias_cmds.items()
    ]

  return '\n'.join([*fn, '', *alias_funcs])


def subs_of(entry, config):
  by_slug = {e['slug']: e for e in config if e.get('parent_func') == entry['slug']}
  return [by_slug[s] for s in entry.get('sub_funcs', [])]


def build_paths_helper(config):
  slugs = sorted(
    f"{entry['parent_func']} {entry['slug']}" if 'parent_func' in entry else entry['slug']
    for entry in config
  )
  lines = ['paths() {']
  for slug in slugs:
    lines.append(f'  echo "{slug}"')
  lines.append('}')
  return '\n'.join(lines)


def main():
  validate(CONFIG)
  functions = '\n\n'.join(build_function(entry, subs_of(entry, CONFIG)) for entry in CONFIG)
  paths_helper = build_paths_helper(CONFIG)

  fd, path = tempfile.mkstemp(prefix='pathfuncs_', suffix='.zsh')
  with os.fdopen(fd, 'w') as f:
    f.write('# Generated shell functions\n\n')
    f.write('source "$DOTFILES_DIR/src/python/pathfuncs.sh"\n\n')
    f.write(functions)
    f.write('\n\n')
    f.write(paths_helper)
    f.write('\n')

  print(path)


if __name__ == '__main__':
  main()


# ARCHIVED
# ----------------------------------------------------------------------------
# Entries previously in CONFIG, kept here for reference. To restore, move back
# into the CONFIG list above.
#
# p('dot-old',     '~/.dotfiles'),
# p('izzy',        '~/src/github/isabella',             'cd_and_cursor'),
# p('hb',          '~/src/github/heartbeat',            aliases=['heartbeat', 'heart']),
# p('mesh',        '~/src/github/mesh'),
# p('spot',        '~/hush-spotlight', 'select',
#   aliases=['spotlight'],
#   commands={
#     'select': 'spotlight_select_action',
#     'a': 'spotlight_add_exclusions',
#     'add': 'spotlight_add_exclusions',
#     'c': 'spotlight_clean_exclusions',
#     'clean': 'spotlight_clean_exclusions',
#     'h': 'spotlight_add_exclusions',
#     'hush': 'spotlight_add_exclusions',
#     'l': 'spotlight_list_exclusions',
#     'list': 'spotlight_list_exclusions',
#     'ls': 'spotlight_list_exclusions',
#     'setup': 'spotlight_setup_index_suppression',
#     'suppress': 'spotlight_setup_index_suppression',
#     's': 'spotlight_setup_index_suppression',
#     'w': 'spotlight_watch_exclusions',
#     'watch': 'spotlight_watch_exclusions',
#   },
# ),
