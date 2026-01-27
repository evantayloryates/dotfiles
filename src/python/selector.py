#!/usr/bin/env python3
import sys
import os

_print = print
COLORS = { 'red': '\033[31m', 'green': '\033[32m', 'yellow': '\033[33m', 'blue': '\033[34m', 'magenta': '\033[35m', 'cyan': '\033[36m', 'white': '\033[37m', 'reset': '\033[0m' }

SCRIPT_NAME = os.path.basename(__file__)
LOG_COLOR = COLORS['green']

def print(*args, **kwargs):
  prefix = f'{LOG_COLOR}[{SCRIPT_NAME}]{COLORS["reset"]}'
  _print(prefix, *args, file=sys.stderr, **kwargs)

def present(*args, **kwargs):
  _print(*args, file=sys.stderr, **kwargs)


def send(value):
  _print(value)


# ============ #
# SCRIPT START #
# ============ #

OPTIONS = [
  { 'name': 'app',                'aliases': ['a']     },
  { 'name': 'browser',            'aliases': ['br']    },
  { 'name': 'browserless',        'aliases': ['bl']    },
  { 'name': 'client_webpack_dev', 'aliases': ['c']     },
  { 'name': 'memcached',          'aliases': ['mem']   },
  { 'name': 'minio',              'aliases': ['mio']   },
  { 'name': 'nginx',              'aliases': ['nx']    },
  { 'name': 'ngrok',              'aliases': ['ng']    },
  { 'name': 'postgres_db',        'aliases': ['pg']    },
  { 'name': 'proxy',              'aliases': ['pr']    },
  { 'name': 'redis',              'aliases': ['red']   },
  { 'name': 'sidekiq',            'aliases': ['sk']    },
  { 'name': 'webpack_dev',        'aliases': ['web']   },
]


def print_options():
  options = sorted(OPTIONS, key=lambda o: o['name'])

  i = 0
  while i < len(options):
    option = options[i]
    index = i + 1
    index_fmt = f' {index}' if index < 10 else f'{index}'

    aliases = option.get('aliases', [])
    alias_str = ''
    if len(aliases) == 1:
      alias_str = aliases[0]
    elif len(aliases) == 2:
      alias_str = f'{aliases[0]}, {aliases[1]}'
    elif len(aliases) > 2:
      alias_str = ', '.join(aliases)

    if alias_str:
      present(f'{index_fmt}) {option["name"]} — {alias_str}')
    else:
      present(f'{index_fmt}) {option["name"]}')

    i += 1

  present('')

  default_input = '1'
  present(f'Selected: {default_input}\033[32m')
  input_value = default_input
  try:
    user_input = sys.stdin.readline()
    if user_input:
      user_input = user_input.rstrip('\n')
      if user_input != '':
        input_value = user_input
  finally:
    _print(COLORS['reset'], file=sys.stderr, end='')

  return input_value


def main():
  print('selecting container...')

  selected = print_options()
  send(selected)
  
if __name__ == '__main__':
  main()
