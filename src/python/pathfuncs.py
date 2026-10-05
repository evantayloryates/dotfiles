#!/usr/bin/env python3
import os
import shlex
import tempfile

# path macros
#
# Sub pathfuncs: an entry with parent_func='<slug>' is a standalone pathfunc that is
# only reachable through its parent (`skills claude`, `skills cc abs`). It gets no
# top-level function or aliases, so it never shadows a real command of the same name
# (claude, codex, cc). The parent must list it in sub_funcs; inside the parent, sub
# selectors win over the `<subcmd> <path>` fallthrough. Omitted child defaults
# inherit the parent's default and its handler; an explicit default overrides it.
def p(slug, path, default=None, commands=None, aliases=None, alias_cmds=None,
      sub_funcs=None, parent_func=None):
  entry = {'slug': slug, 'path': path, 'commands': commands or {}}
  if default is not None or parent_func is None:
    entry['default'] = default if default is not None else 'cd'
  if aliases:
    entry['aliases'] = aliases
  if alias_cmds:
    entry['alias_cmds'] = alias_cmds
  if sub_funcs:
    entry['sub_funcs'] = sub_funcs
  if parent_func:
    entry['parent_func'] = parent_func
  return entry


# Global remaps: apply to every pathfunc (and sub pathfunc) when everything typed
# after the trigger matches `trigger` exactly (`dot cd`, not `dot cd foo`). The
# command runs inside the target dir like any other passthrough (see
# __pathfuncs_in). A per-pathfunc `commands` entry of the same name wins.
GLOBALS = [
  {'trigger': 'cd',   'command': 'cd .'},
  {'trigger': 'code', 'command': 'code .'},
  {'trigger': 'open', 'command': 'open .'},
  {'trigger': 'abs',  'command': 'abs .'},
]

KICKOFF_CONTAINER = 'code --folder-uri vscode-remote://ssh-remote+kickoff.devpod/workspaces'

CONFIG = [
  p('app',         '/Applications',                     'open'), # TODO: link all app dirs /Applications, /System/Applications, /System/Applications/Utilities, /System/Library/CoreServices/Applications/
  p('conversations', '~/Desktop/conversations',         'select', aliases=['chats', 'convos', 'convo'],
    commands={'select': '__conversations_select <path>'}),
  p('desktop',     '~/Desktop',                         'cd', aliases=['d', 'desk', 'Desktop'],
    commands={'clean': '__desk_clean <args>'}),
  p('documents',   '~/Documents',                       'cd', aliases=['docs', 'doc', 'Documents']),
  p('domputer',    '~/src/github/domputer',             'cd', aliases=['dom']),
  p('dotfiles',    '$DOTFILES_DIR',                     'cd', aliases=['dot']),
  p('downloads',   '~/Downloads',                       'cd', aliases=['down', 'Downloads']),
  p('gif',         '~/Pictures/gifs',                   'cd', aliases=['gifs']),
  p('github',      '~/src/github',                      'cd', aliases=['ghb', 'gthb', 'ghub', 'gith']),
  p('health',      '~/Documents/Health',                'cd', aliases=['Health']),
  p('home',        '~',                                 'cd', aliases=['Home', 'me']),
  p('html',        '~/src/docs/html',                   'select', aliases=['htm'],
    commands={'select': '__html_select <path>'}),
  p('ideas',       '~/Desktop/ideas',                   'cd'),
  p('joe',         '~/src/github/joe-airbrand',         'cd'),
  # `kickoff code` (and every alias) opens the dev container instead of the local folder.
  # Connect directly: `devpod up` reruns host-init and can remove the running DB.
  p('kickoff',     '~/src/github/kickoff',              'cd', aliases=['kick', 'kck'],
    commands={'code': KICKOFF_CONTAINER, 'container': KICKOFF_CONTAINER}),
  p('kit',         '~/.config/kitty',                   aliases=['kitty'], commands={'reload': '/Applications/kitty.app/Contents/MacOS/kitty @ load-config <path>/kitty.conf'}),
  p('library',     '~/Library',                         'cd', aliases=['lib', 'Library']),
  p('mac',         '~/src/macos',                       'cd', aliases=['macos']),
  p('movies',      '~/Movies',                          'cd', aliases=['mov', 'Movies']),
  p('music',       '~/Music',                           'cd', aliases=['Music']),
  p('notes',       '~/Desktop/notes'),
  p('pathfuncs',   '$DOTFILES_DIR/src/python/pathfuncs.py','code', commands={'code': 'code <path>'}, aliases=['pathfunc', 'pathfns', 'pathfn', 'pathfuns', 'pathfun', 'pthfuncs', 'pthfunc', 'pthfns', 'pthfn', 'pthfuns', 'pthfun', 'pfuncs', 'pfunc', 'pfns', 'pfn', 'pfuns', 'pfun' ]),
  p('pictures',    '~/Pictures',                        'cd', aliases=['pics', 'pic', 'Pictures']),
  p('plans',       '~/src/docs/plans',                  'open', aliases=['pln', 'plan']),
  p('pod',         '~/src/github/podsauce',             'cd'),
  p('r1',          '~/src/github/r1',                   'cd', aliases=['rone', 'rem']),
  p('src',         '~/src',                             'cd', aliases=['s']),
  p('sca',         '~/src/github/r1/sca',               'cd'),
  p('screenshots', '~/Pictures/Screenshots',            'open', aliases=['ss', 'shots', 'screenshot']),
  p('skills',      '~/src/docs/skills',                 'select', aliases=['skl', 'skill'],
    commands={'select': '__skills_select <path>'}, sub_funcs=['claude', 'codex']),
  p('claude',      '~/.claude/skills',                  parent_func='skills', aliases=['cc']),
  p('codex',       '~/.codex/skills',                   parent_func='skills', aliases=['cdx', 'cod']),
  p('taxes',       '~/Documents/Taxes',                 'cd', aliases=['tax']),
  p('theo',        '$DOTFILES_DIR/src/switchboard',     'cd', aliases=['switchboard'],
    commands={'vnc': '<path>/bin/theo-vnc <args>', 'air': '<path>/bin/theo-air <args>'}),
  p('vsx',         '~/src/vscode-extensions'),
  p('amp',        '~/src/github/amplify', aliases=['amplify'], alias_cmds={'up': 'update'},
    commands={
      'disable': 'safemv <path>/.git/hooks/pre-commit <path>/.git/hooks/pre-commit.disabled && echo "pre-commit disabled" || echo "failed to disable"',
      'enable': 'safemv <path>/.git/hooks/pre-commit.disabled <path>/.git/hooks/pre-commit && echo "pre-commit enabled" || echo "failed to enable"',
      'exec': '__amplify_exec <args_text>',
      'logs': '__amplify_logs <args_text>',
      'log': '__amplify_logs <args_text>',
      'restart': '__amplify_restart <args_text>',
      'ssh': '__ssh_prod',
      'prod': '__ssh_prod',
      'stage': '__ssh_stage',
      'lint': '<path>/scripts/lint -A',
      'update': '__amplify_update <args>',
    }
  ),
  p('nex',         '~/src/github/nexrender-scripts',    'dev',
    commands={
      'dev'      : '<path>/scripts/local/ssh',
      'get'      : '<path>/scripts/local/get <args>',
      'ssh'      : 'make -C <path>/../nexrender-api ssh',
      'vnc'      : 'make -C <path>/../nexrender-api vnc',
      'pwd'      : 'make -C <path>/../nexrender-api send-pwd',
      'password' : 'make -C <path>/../nexrender-api send-pwd',
      'tmux'     : '<path>/scripts/local/nex.sh',
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


def shell_path(path):
  """Quote literal paths; resolve supported roots in the invoking shell.

  Only a leading ~, $HOME or $DOTFILES_DIR (also ${...}) is dynamic.
  The rest is literal, including spaces, quotes and shell metacharacters.
  """
  for root, variable in [('~', 'HOME'), ('$HOME', 'HOME'), ('${HOME}', 'HOME'),
                         ('$DOTFILES_DIR', 'DOTFILES_DIR'),
                         ('${DOTFILES_DIR}', 'DOTFILES_DIR')]:
    if path == root or path.startswith(root + '/'):
      return f'"${{{variable}}}"' + shlex.quote(path[len(root):])
  # ~user means that user's home, never a suffix of the current user's home.
  return shlex.quote(os.path.expanduser(path))


def resolve_config(config):
  """Apply compound defaults without mutating the source configuration.

  Only the default's handler is inherited, using the child's own target path.
  Explicit child defaults and handlers take precedence.
  """
  validate(config)
  top = {e['slug']: e for e in config if 'parent_func' not in e}
  resolved = []
  for entry in config:
    effective = {**entry, 'commands': dict(entry['commands'])}
    if 'parent_func' in entry:
      parent = top[entry['parent_func']]
      default = entry.get('default', parent.get('default', 'cd'))
      effective['default'] = default
      if default in parent['commands']:
        effective['commands'].setdefault(default, parent['commands'][default])
    resolved.append(effective)
  return resolved


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
    f'  local __pf_target={shell_path(path)}',
    '  local subcmd="$1"',
    '  if [[ $# -gt 0 ]]; then shift; fi',
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
      cmd.replace('<path>', '"$__pf_target"')
         .replace('<args>', '"$@"')
         .replace('<args_text>', '"$*"')
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
    fn.append(f'      {slug} "{default}" "$@"')
  else:
    fn.append(f'      {default} "$__pf_target"')
  # Passthrough: run the command as typed from inside the target (a file target
  # "goes to" its parent dir). __pathfuncs_in returns to the original dir unless
  # the command itself changed directory.
  fn.extend([
    '      ;;',
    '    * )',
    '      __pathfuncs_in "$__pf_target" "$subcmd" "$@"',
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


def build_globals(globals_):
  lines = ['typeset -gA __PATHFUNCS_GLOBALS=(']
  for g in globals_:
    lines.append(f"  {shlex.quote(g['trigger'])} {shlex.quote(g['command'])}")
  lines.append(')')
  return '\n'.join(lines)


# Every function name the generated file defines. On `reload`, the names from the
# previous generation are dropped first, so a pathfunc or alias removed from CONFIG
# stops existing instead of lingering in open shells with its old behavior.
def build_names_reset(config):
  names = []
  for entry in config:
    names.append(fn_name(entry))
    if 'parent_func' not in entry:
      names += [*entry.get('aliases', []), *entry.get('alias_cmds', {})]
  return '\n'.join([
    '(( $+__PATHFUNCS_NAMES )) && unfunction -- $__PATHFUNCS_NAMES 2>/dev/null',
    f"typeset -ga __PATHFUNCS_NAMES=({' '.join(shlex.quote(n) for n in names)})",
  ])


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
  config = resolve_config(CONFIG)
  functions = '\n\n'.join(build_function(entry, subs_of(entry, config)) for entry in config)
  paths_helper = build_paths_helper(config)

  fd, path = tempfile.mkstemp(prefix='pathfuncs_', suffix='.zsh')
  with os.fdopen(fd, 'w') as f:
    f.write('# Generated shell functions\n\n')
    f.write('source "$DOTFILES_DIR/src/python/pathfuncs.sh"\n\n')
    f.write(build_names_reset(config))
    f.write('\n\n')
    f.write(build_globals(GLOBALS))
    f.write('\n\n')
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
