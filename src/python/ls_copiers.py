import re
import subprocess
import sys

COPIER_RE = re.compile(
    r'^(_[a-z0-9](?:[a-z0-9]*(_[a-z0-9]+)*)?) {0,5}\( {0,5}\) {0,5}\{')


def extract_variants(fn_name, lines, copiers_path):
    # first, check if any of the lines start with the fn_name__variants function
    full_variants_fn = f"{fn_name}__variants"
    variants_exist = False
    for line in lines:
        if line.startswith(full_variants_fn):
            variants_exist = True

    if not variants_exist:
        return []
    cmd = f'source {copiers_path}; {full_variants_fn}'
    sys.stdout.write(f"CMD: {cmd}\n")
    
    variants = eval_command(cmd)
    sys.stdout.write(f"VARIANTS: {variants.join('\n')}\n")
    
    # then, extract the variants from the result
    return variants.split(' ')


def extract_copiers(copiers_path):
    with open(copiers_path, 'r') as f:
        lines = f.read().splitlines()

    copiers = []
    for line in lines:
        m = COPIER_RE.match(line)
        if m:
            fn_name = m.group(1)
            copier_fn = {
                'fn': fn_name,
                'variants': extract_variants(fn_name, lines, copiers_path),
            }
            copiers.append(copier_fn)
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
    full_fn = f"{copier_fn} {variant}".strip()
    cmd = (
        f'source {copiers_path}; '
        f'{full_fn}; '
        f'/usr/bin/pbpaste; '
        f': | /usr/bin/pbcopy'
    )
    result = eval_command(cmd)
    # Clear clipboard
    eval_command('pbcopy < /dev/null')

    return result


def sh_quote(s):
    # minimal safe single-quote wrapper for shell strings
    return "'" + s.replace("'", "'\\''") + "'"


def main():
    copiers_path = sys.argv[1]

    copiers = extract_copiers(copiers_path)

    products = []
    for copier in copiers:
        fn_name = copier['fn']
        variants = copier['variants']
        if len(variants) == 0:
            result = eval_copier_fn(copiers_path, fn_name)
            products.append((fn_name, result, ''))
        else:
            for variant in variants:
                result = eval_copier_fn(copiers_path, fn_name, variant)
                products.append((fn_name, result, variant))

    sorted_products = sorted(products, key=lambda x: x[0])
    for fn_name, result, variant in sorted_products:
        sys.stdout.write(f"{fn_name} {variant}\n")
        sys.stdout.write(f"{result}\n")


if __name__ == '__main__':
    main()
