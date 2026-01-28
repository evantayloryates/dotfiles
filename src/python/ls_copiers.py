import re
import subprocess
import sys

COPIER_RE = re.compile(
    r'^(_[a-z0-9](?:[a-z0-9]*(_[a-z0-9]+)*)?) {0,5}\( {0,5}\) {0,5}\{'
)

PADDING_BUFFER = 2


def extract_variants(fn_name, lines, copiers_path):
    full_variants_fn = f'{fn_name}__variants'
    variants_exist = any(line.startswith(full_variants_fn) for line in lines)
    if not variants_exist:
        return []

    cmd = f'source {copiers_path}; {full_variants_fn}'
    result = eval_command(cmd)
    variants = result.strip().split(' ')
    return [v for v in variants if v and not v.isspace()]


def extract_copiers(copiers_path):
    with open(copiers_path, 'r') as f:
        lines = f.read().splitlines()

    copiers = []
    for line in lines:
        m = COPIER_RE.match(line)
        if m:
            fn_name = m.group(1)
            copiers.append({
                'fn': fn_name,
                'variants': extract_variants(fn_name, lines, copiers_path),
            })
    return copiers


def eval_command(command):
    result = subprocess.run(
        ['/bin/zsh', '-lc', command],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


def eval_copier_fn(copiers_path, copier_fn, variant=''):
    full_fn = f'{copier_fn} {variant}'.strip()
    cmd = (
        f'source {copiers_path}; '
        f'{full_fn}; '
        f'/usr/bin/pbpaste; '
        f': | /usr/bin/pbcopy'
    )
    result = eval_command(cmd)
    eval_command('pbcopy < /dev/null')
    return result


def sanitize_inline(s):
    # Keep output to a single line; preserve visible intent.
    s = s.rstrip('\n')
    s = s.replace('\\', '\\\\')
    s = s.replace('\t', '\\t')
    s = s.replace('\r', '\\r')
    s = s.replace('\n', '\\n')
    return s


def display_name(fn_name, variant):
    return f'{fn_name} {variant}'.strip()


COLOR_CODES = {
    'black_bold_bright': ['\033[1;90m', '\033[0m'],
    'black_bold': ['\033[1;30m', '\033[0m'],
    'black_bright': ['\033[90m', '\033[0m'],
    'black_dim_bright': ['\033[2;90m', '\033[0m'],
    'black_dim': ['\033[2;30m', '\033[0m'],
    'black': ['\033[30m', '\033[0m'],
    'blue_bold_bright': ['\033[1;94m', '\033[0m'],
    'blue_bold': ['\033[1;34m', '\033[0m'],
    'blue_bright': ['\033[94m', '\033[0m'],
    'blue_dim_bright': ['\033[2;94m', '\033[0m'],
    'blue_dim': ['\033[2;34m', '\033[0m'],
    'blue': ['\033[34m', '\033[0m'],
    'cyan_bold_bright': ['\033[1;96m', '\033[0m'],
    'cyan_bold': ['\033[1;36m', '\033[0m'],
    'cyan_bright': ['\033[96m', '\033[0m'],
    'cyan_dim_bright': ['\033[2;96m', '\033[0m'],
    'cyan_dim': ['\033[2;36m', '\033[0m'],
    'cyan': ['\033[36m', '\033[0m'],
    'green_bold_bright': ['\033[1;92m', '\033[0m'],
    'green_bold': ['\033[1;32m', '\033[0m'],
    'green_bright': ['\033[92m', '\033[0m'],
    'green_dim_bright': ['\033[2;92m', '\033[0m'],
    'green_dim': ['\033[2;32m', '\033[0m'],
    'green': ['\033[32m', '\033[0m'],
    'magenta_bold_bright': ['\033[1;95m', '\033[0m'],
    'magenta_bold': ['\033[1;35m', '\033[0m'],
    'magenta_bright': ['\033[95m', '\033[0m'],
    'magenta_dim_bright': ['\033[2;95m', '\033[0m'],
    'magenta_dim': ['\033[2;35m', '\033[0m'],
    'magenta': ['\033[35m', '\033[0m'],
    'red_bold_bright': ['\033[1;91m', '\033[0m'],
    'red_bold': ['\033[1;31m', '\033[0m'],
    'red_bright': ['\033[91m', '\033[0m'],
    'red_dim_bright': ['\033[2;91m', '\033[0m'],
    'red_dim': ['\033[2;31m', '\033[0m'],
    'red': ['\033[31m', '\033[0m'],
    'white_bold_bright': ['\033[1;97m', '\033[0m'],
    'white_bold': ['\033[1;37m', '\033[0m'],
    'white_bright': ['\033[97m', '\033[0m'],
    'white_dim_bright': ['\033[2;97m', '\033[0m'],
    'white_dim': ['\033[2;37m', '\033[0m'],
    'white': ['\033[37m', '\033[0m'],
    'yellow_bold_bright': ['\033[1;93m', '\033[0m'],
    'yellow_bold': ['\033[1;33m', '\033[0m'],
    'yellow_bright': ['\033[93m', '\033[0m'],
    'yellow_dim_bright': ['\033[2;93m', '\033[0m'],
    'yellow_dim': ['\033[2;33m', '\033[0m'],
    'yellow': ['\033[33m', '\033[0m'],
}


def c(s, color='white'):
    open_code, close_code = COLOR_CODES[color]
    return f'{open_code}{s}{close_code}'


def main():
    copiers_path = sys.argv[1]
    copiers = extract_copiers(copiers_path)

    rows = []
    for copier in copiers:
        fn_name = copier['fn']
        variants = copier['variants']

        if not variants:
            variant = ''
            result = eval_copier_fn(copiers_path, fn_name, variant)
            rows.append((display_name(fn_name, variant),
                        sanitize_inline(result)))
            continue

        for variant in variants:
            result = eval_copier_fn(copiers_path, fn_name, variant)
            rows.append((display_name(fn_name, variant),
                        sanitize_inline(result)))

    rows.sort(key=lambda x: x[0])
    max_len = max((len(name) for name, _ in rows), default=0)
    pad_to = max_len + PADDING_BUFFER

    OPTIONS = [
        ['blue_bold_bright', 'blue_bold'],
        ['blue_bold_bright', 'blue_bright'],
        ['blue_bold_bright', 'blue_dim_bright'],
        ['blue_bold_bright', 'blue_dim'],
        ['blue_bold_bright', 'blue'],
        ['blue_bold', 'blue_bold_bright'],
        ['blue_bold', 'blue_bright'],
        ['blue_bold', 'blue_dim_bright'],
        ['blue_bold', 'blue_dim'],
        ['blue_bold', 'blue'],
        ['blue_bright', 'blue_bold_bright'],
        ['blue_bright', 'blue_bold'],
        ['blue_bright', 'blue_dim_bright'],
        ['blue_bright', 'blue_dim'],
        ['blue_bright', 'blue'],
        ['blue_dim_bright', 'blue_bold_bright'],
        ['blue_dim_bright', 'blue_bold'],
        ['blue_dim_bright', 'blue_bright'],
        ['blue_dim_bright', 'blue_dim'],
        ['blue_dim_bright', 'blue'],
        ['blue_dim', 'blue_bold_bright'],
        ['blue_dim', 'blue_bold'],
        ['blue_dim', 'blue_bright'],
        ['blue_dim', 'blue_dim_bright'],
        ['blue_dim', 'blue'],
        ['blue', 'blue_bold_bright'],
        ['blue', 'blue_bold'],
        ['blue', 'blue_bright'],
        ['blue', 'blue_dim_bright'],
        ['blue', 'blue_dim']
    ]
    test = OPTIONS[0]
    FN_COLOR = test[0]
    VARIANT_COLOR = test[1]

    # NO:
    #  - 'black_dim'
    #  - 'white_dim'
    #  - 'white_dim_bright'
    #  - 'black_bright'
    ARROW_COLOR = 'black_bold_bright'
    RESULT_COLOR = 'white'

    for name, value in rows:
        # split once: "_glob app" → "_glob", "app"
        if ' ' in name:
            fn, variant = name.split(' ', 1)
            colored_name = (
                c(fn, FN_COLOR) +
                ' ' +
                c(variant, VARIANT_COLOR)
            )
        else:
            fn = name
            colored_name = c(fn, FN_COLOR)

        padding = ' ' * (pad_to - len(name))

        sys.stdout.write(
            # f'{colored_name}{padding}'
            # f'{c("=>", ARROW_COLOR)} '
            # f'{c(value, RESULT_COLOR)}\n'
            f'{colored_name}{padding}\n'
        )


if __name__ == '__main__':
    main()
