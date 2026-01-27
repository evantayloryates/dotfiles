#!/usr/bin/env python3
import sys
import os
import readline

_print = print
COLORS = {'red': '\033[31m', 'green': '\033[32m', 'yellow': '\033[33m', 'blue': '\033[34m',
          'magenta': '\033[35m', 'cyan': '\033[36m', 'white': '\033[37m', 'reset': '\033[0m'}

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
    {'name': 'app',                'aliases': ['a']},
    {'name': 'browser',            'aliases': ['br']},
    {'name': 'browserless',        'aliases': ['bl']},
    {'name': 'client_webpack_dev', 'aliases': ['c']},
    {'name': 'memcached',          'aliases': ['mem']},
    {'name': 'minio',              'aliases': ['mio']},
    {'name': 'nginx',              'aliases': ['nx']},
    {'name': 'ngrok',              'aliases': ['ng']},
    {'name': 'postgres_db',        'aliases': ['pg']},
    {'name': 'proxy',              'aliases': ['pr']},
    {'name': 'redis',              'aliases': ['red']},
    {'name': 'sidekiq',            'aliases': ['sk']},
    {'name': 'webpack_dev',        'aliases': ['web']},
]


TTY = open('/dev/tty', 'r')


def read_input(prompt):
    present(prompt, end='', flush=True)
    user_input = TTY.readline()
    if not user_input:
        return ''
    return user_input.rstrip('\n')

def sorted_options():
  return sorted(OPTIONS, key=lambda o: o['name'].lower())

def print_options(options):
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


def process_invalid_input(user_input):
    cleaned = (user_input or '').strip()
    display = cleaned if cleaned != '' else '<empty>'

    present(
        f'{COLORS["red"]}Invalid input: {COLORS["white"]}{display}{COLORS["red"]}. Exiting...{COLORS["reset"]}'
    )
    return ''


def lookup_option(raw_value, options_sorted):
    v = (raw_value or '').strip()

    # 1) empty
    if v == '':
        return process_invalid_input(raw_value)

    # 2) number -> option by index (1-based)
    if v.isdigit():
        idx = int(v)
        if 1 <= idx <= len(options_sorted):
            return options_sorted[idx - 1]['name']
        return process_invalid_input(raw_value)

    # 3) name/alias (case-insensitive)
    v_lower = v.lower()
    i = 0
    while i < len(options_sorted):
        opt = options_sorted[i]
        if opt['name'].lower() == v_lower:
            return opt['name']

        aliases = opt.get('aliases', [])
        j = 0
        while j < len(aliases):
            if aliases[j].lower() == v_lower:
                return opt['name']
            j += 1

        i += 1

    return process_invalid_input(raw_value)


def resolve_selection(raw_value, options_sorted):
    return lookup_option(raw_value, options_sorted)


def present_options():
    options = sorted_options()
    print_options(options)

    user_input = read_input('Selected: ')
    present('')  # newline after Enter for clean output

    return resolve_selection(user_input, options)


def main():
    incoming = sys.stdin.readline()
    incoming = incoming.rstrip('\n') if incoming else ''
    lookup_option(incoming, sorted_options())
    present(f'incoming: {incoming}')

    present('')

    selected = present_options()
    send(selected)


if __name__ == '__main__':
    main()
