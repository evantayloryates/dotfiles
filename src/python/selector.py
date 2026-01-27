#!/usr/bin/env python3
import sys
import os

_print = print
COLORS = { 'red': '\033[31m', 'green': '\033[32m', 'yellow': '\033[33m', 'blue': '\033[34m', 'magenta': '\033[35m', 'cyan': '\033[36m', 'white': '\033[37m', 'reset': '\033[0m' }

OPTIONS = OPTIONS = [
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


SCRIPT_NAME = os.path.basename(__file__)
LOG_COLOR = COLORS['green']

def print(*args, **kwargs):
  prefix = f'{LOG_COLOR}[{SCRIPT_NAME}]{COLORS["reset"]}'
  _print(prefix, *args, file=sys.stderr, **kwargs)


def send(value):
  _print(value)

def main():
  print('selecting container...')
  send('app')

if __name__ == '__main__':
  main()
