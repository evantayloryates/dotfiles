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

  # Alias redirect functions
  alias_funcs = [f'{alias}() {{ {slug} "$@"; }}' for alias in aliases]

  return '\n'.join([*fn, '', *alias_funcs])


def build_paths_helper(config: List[Dict[str, Any]]) -> str:
  slugs = [entry['slug'] for entry in config]
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
    f.write('# Helper to list all path slugs\n')
    f.write(paths_helper)
    f.write('\n\n')
    f.write('printf "\\n[paths] Run `paths` to see all available path functions.\\n"\\n')

  print(path)


if __name__ == '__main__':
  main()
