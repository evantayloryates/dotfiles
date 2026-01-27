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


def clean_input(incoming):
    return (incoming or '').strip()


def read_input(prompt):
    present(prompt, end='', flush=True)
    user_input = TTY.readline()
    if not user_input:
        return ''
    return clean_input(user_input)


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


def lookup_option(clean_input, options_sorted, allow_index=True):
    v = clean_input

    # 1) empty
    if v == '':
        return None

    # 2) number -> option by index (1-based)
    if allow_index and v.isdigit():
        idx = int(v)
        if 1 <= idx <= len(options_sorted):
            return options_sorted[idx - 1]
        return None

    # 3) name/alias (case-insensitive)
    v_lower = v.lower()
    i = 0
    while i < len(options_sorted):
        opt = options_sorted[i]
        if opt['name'].lower() == v_lower:
            return opt

        aliases = opt.get('aliases', [])
        j = 0
        while j < len(aliases):
            if aliases[j].lower() == v_lower:
                return opt
            j += 1

        i += 1

    return None


def resolve_selection(raw_value, options_sorted):
    clean_input = clean_input(raw_value)
    opt = lookup_option(clean_input, options_sorted)
    if opt is None:
        return process_invalid_input(clean_input)

    return opt['name']


def present_options():
    options = sorted_options()
    print_options(options)

    user_input = read_input('Selected: ')
    present('')  # newline after Enter for clean output

    return resolve_selection(user_input, options)


def preresolve_from_input(incoming):
    return lookup_option(incoming, sorted_options(), allow_index=False)


def main():
    incoming = sys.stdin.readline()
    incoming = incoming.rstrip('\n') if incoming else ''

    result_option = lookup_option(
        incoming, sorted_options(), allow_index=False)
    present(f'result_option: {result_option}')

    present('')

    selected = present_options()
    send(selected)


if __name__ == '__main__':
    main()
