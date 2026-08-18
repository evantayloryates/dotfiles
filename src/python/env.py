import os
import re
import sys

COLOR_CODES = {
    'black_bold_bright':   ['\033[1;90m', '\033[0m'],
    'black_bold':          ['\033[1;30m', '\033[0m'],
    'black_bright':        ['\033[90m', '\033[0m'],
    'black_dim_bright':    ['\033[2;90m', '\033[0m'],
    'black_dim':           ['\033[2;30m', '\033[0m'],
    'black':               ['\033[30m', '\033[0m'],
    'blue_bold_bright':    ['\033[1;94m', '\033[0m'],
    'blue_bold':           ['\033[1;34m', '\033[0m'],
    'blue_bright':         ['\033[94m', '\033[0m'],
    'blue_dim_bright':     ['\033[2;94m', '\033[0m'],
    'blue_dim':            ['\033[2;34m', '\033[0m'],
    'blue':                ['\033[34m', '\033[0m'],
    'cyan_bold_bright':    ['\033[1;96m', '\033[0m'],
    'cyan_bold':           ['\033[1;36m', '\033[0m'],
    'cyan_bright':         ['\033[96m', '\033[0m'],
    'cyan_dim_bright':     ['\033[2;96m', '\033[0m'],
    'cyan_dim':            ['\033[2;36m', '\033[0m'],
    'cyan':                ['\033[36m', '\033[0m'],
    'green_bold_bright':   ['\033[1;92m', '\033[0m'],
    'green_bold':          ['\033[1;32m', '\033[0m'],
    'green_bright':        ['\033[92m', '\033[0m'],
    'green_dim_bright':    ['\033[2;92m', '\033[0m'],
    'green_dim':           ['\033[2;32m', '\033[0m'],
    'green':               ['\033[32m', '\033[0m'],
    'magenta_bold_bright': ['\033[1;95m', '\033[0m'],
    'magenta_bold':        ['\033[1;35m', '\033[0m'],
    'magenta_bright':      ['\033[95m', '\033[0m'],
    'magenta_dim_bright':  ['\033[2;95m', '\033[0m'],
    'magenta_dim':         ['\033[2;35m', '\033[0m'],
    'magenta':             ['\033[35m', '\033[0m'],
    'red_bold_bright':     ['\033[1;91m', '\033[0m'],
    'red_bold':            ['\033[1;31m', '\033[0m'],
    'red_bright':          ['\033[91m', '\033[0m'],
    'red_dim_bright':      ['\033[2;91m', '\033[0m'],
    'red_dim':             ['\033[2;31m', '\033[0m'],
    'red':                 ['\033[31m', '\033[0m'],
    'white_bold_bright':   ['\033[1;97m', '\033[0m'],
    'white_bold':          ['\033[1;37m', '\033[0m'],
    'white_bright':        ['\033[97m', '\033[0m'],
    'white_dim_bright':    ['\033[2;97m', '\033[0m'],
    'white_dim':           ['\033[2;37m', '\033[0m'],
    'white':               ['\033[37m', '\033[0m'],
    'yellow_bold_bright':  ['\033[1;93m', '\033[0m'],
    'yellow_bold':         ['\033[1;33m', '\033[0m'],
    'yellow_bright':       ['\033[93m', '\033[0m'],
    'yellow_dim_bright':   ['\033[2;93m', '\033[0m'],
    'yellow_dim':          ['\033[2;33m', '\033[0m'],
    'yellow':              ['\033[33m', '\033[0m']
}


def c(s, color='white'):
    open_code, close_code = COLOR_CODES[color]
    return f'{open_code}{s}{close_code}'


# Values for keys that look like credentials are masked by default so a stray
# `env` — or any tool/agent/CI step that runs it — never spills secrets to
# stdout or logs. Reveal with `ENV_REVEAL=1 env` or `env.py --reveal`.
SENSITIVE = re.compile(
    r'KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE|PAT',
    re.IGNORECASE,
)
REVEAL = os.environ.get('ENV_REVEAL') == '1' or '--reveal' in sys.argv


def mask(value):
    if not value:
        return ''
    if len(value) <= 8:
        return '•' * len(value)
    return f'{value[:3]}…{value[-2:]} ({len(value)} chars)'


def display_value(key, value):
    if REVEAL or not SENSITIVE.search(key):
        return value
    return mask(value)


NAME_COLORS = ['magenta_dim', 'black_bold_bright']
VALUE_COLORS = ['magenta', 'white']
DELIMITER = ''
items = [
    (k, v)
    for k, v in os.environ.items()
    if k != 'PATH'
]

items.sort(key=lambda x: x[0])

PADDING_BUFFER = 1
max_name_len = max(len(k) for k, _ in items)
pad_to = max_name_len + PADDING_BUFFER

print()
for idx, (k, v) in enumerate(items):
    padded_name = k.ljust(pad_to)

    name_color = NAME_COLORS[idx % len(NAME_COLORS)]
    value_color = VALUE_COLORS[idx % len(VALUE_COLORS)]

    print(
        f'{c(padded_name, name_color)}'
        f'{c(display_value(k, v), value_color)}'
    )
print()