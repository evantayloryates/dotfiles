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
    'black': '30',
    'red': '31',
    'green': '32',
    'yellow': '33',
    'blue': '34',
    'magenta': '35',
    'cyan': '36',
    'white': '37',
    'gray': '90',
    'dark_blue': '94',
}


def c(s, color='white'):
    return f'\033[{COLOR_CODES[color]}m{s}\033[0m'


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

    FN_COLOR = 'blue'
    VARIANT_COLOR = 'dark_blue'
    ARROW_COLOR = 'gray'
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
            f'{colored_name}{padding}'
            f'{c("=>", ARROW_COLOR)} '
            f'{c(value, RESULT_COLOR)}\n'
        )


if __name__ == '__main__':
    main()
