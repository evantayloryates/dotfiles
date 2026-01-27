#!/usr/bin/env python3
import sys
import os

_print = print

SCRIPT_NAME = os.path.splitext(os.path.basename(__file__))[0]

def print(*args, **kwargs):
  prefix = f'[{SCRIPT_NAME}]'
  _print(prefix, *args, file=sys.stderr, **kwargs)


def send(value):
  _print(value)

def main():
  print('selecting container...')
  send('app')

if __name__ == '__main__':
  main()
