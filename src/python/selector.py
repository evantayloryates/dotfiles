#!/usr/bin/env python3
import sys

_print = print

def print(*args, **kwargs):
  _print(*args, file=sys.stderr, **kwargs)

def send(value):
  _print(value)

def main():
  print('selecting container...')
  send('app')

if __name__ == '__main__':
  main()
