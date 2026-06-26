#!/usr/bin/env python3
"""
Validation test harness for cerebras client scopes and subscopes.

Usage:
    python3 test.py [--data-dir PATH]

Dependencies (pip install jsonschema):
    jsonschema>=4.0.0
"""

import os
import sys
import json
import argparse

try:
    import jsonschema
except ImportError:
    print('error: jsonschema not installed — run: pip install jsonschema', file=sys.stderr)
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'data'))
TUNES_SCHEMA_PATH = os.path.join(SCRIPT_DIR, 'tunes.schema.json')


def load_tunes_schema():
    with open(TUNES_SCHEMA_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def check_json_schema_valid(schema_obj):
    try:
        jsonschema.Draft7Validator.check_schema(schema_obj)
        return True, None
    except jsonschema.SchemaError as e:
        return False, str(e.message)


def iter_scope_dirs(data_dir):
    """Yield (path, scope_name, subscope_name) for all root scopes and subscopes."""
    if not os.path.isdir(data_dir):
        return
    for scope_name in sorted(os.listdir(data_dir)):
        scope_path = os.path.join(data_dir, scope_name)
        if not os.path.isdir(scope_path):
            continue
        yield scope_path, scope_name, None
        subscopes_dir = os.path.join(scope_path, 'subscopes')
        if os.path.isdir(subscopes_dir):
            for sub_name in sorted(os.listdir(subscopes_dir)):
                sub_path = os.path.join(subscopes_dir, sub_name)
                if os.path.isdir(sub_path):
                    yield sub_path, scope_name, sub_name


def validate_scope(scope_path, scope_name, subscope_name, tunes_schema, errors):
    label = f'{scope_name}/{subscope_name}' if subscope_name else scope_name

    schema_path = os.path.join(scope_path, 'schema.json')
    tunes_path = os.path.join(scope_path, 'tunes.jsonl')
    cases_path = os.path.join(scope_path, 'cases.jsonl')

    has_schema = False

    # --- schema.json ---
    if os.path.isfile(schema_path):
        try:
            with open(schema_path, 'r', encoding='utf-8') as f:
                scope_schema = json.load(f)
            valid, err = check_json_schema_valid(scope_schema)
            if valid:
                print(f'  [OK] {label}/schema.json — valid JSON Schema')
                has_schema = True
            else:
                errors.append(f'{label}/schema.json: invalid JSON Schema — {err}')
        except (json.JSONDecodeError, OSError) as e:
            errors.append(f'{label}/schema.json: could not load — {e}')

    # --- tunes.jsonl ---
    if not os.path.isfile(tunes_path):
        errors.append(f'{label}: missing tunes.jsonl')
    else:
        with open(tunes_path, 'r', encoding='utf-8') as f:
            raw_lines = [l.strip() for l in f if l.strip()]

        print(f'  [..] {label}/tunes.jsonl — {len(raw_lines)} entr{"ies" if len(raw_lines) != 1 else "y"}')

        for i, line in enumerate(raw_lines, 1):
            try:
                entry = json.loads(line)
            except json.JSONDecodeError as e:
                errors.append(f'{label}/tunes.jsonl line {i}: invalid JSON — {e}')
                continue

            # Validate against tunes.schema.json
            try:
                jsonschema.validate(entry, tunes_schema,
                                    cls=jsonschema.Draft7Validator)
            except jsonschema.ValidationError as e:
                errors.append(f'{label}/tunes.jsonl line {i}: {e.message}')
                continue

            # Without a scope schema, content must be a non-empty string
            if not has_schema:
                content = entry.get('content', '')
                if not isinstance(content, str) or not content.strip():
                    errors.append(
                        f'{label}/tunes.jsonl line {i}: '
                        f'content must be a non-empty string when no schema.json is present'
                    )

    # --- cases.jsonl ---
    if not os.path.isfile(cases_path):
        errors.append(f'{label}: missing cases.jsonl')
    else:
        with open(cases_path, 'r', encoding='utf-8') as f:
            case_count = sum(1 for l in f if l.strip())
        print(f'  [..] {label}/cases.jsonl — {case_count} case{"s" if case_count != 1 else ""} logged')


def main():
    parser = argparse.ArgumentParser(
        description='Cerebras scope/subscope validation harness'
    )
    parser.add_argument(
        '--data-dir',
        default=DEFAULT_DATA_DIR,
        help=f'Root data directory (default: {DEFAULT_DATA_DIR})',
    )
    args = parser.parse_args()

    print(f'data dir : {os.path.abspath(args.data_dir)}')
    print()

    try:
        tunes_schema = load_tunes_schema()
    except (OSError, json.JSONDecodeError) as e:
        print(f'FATAL: could not load tunes.schema.json — {e}', file=sys.stderr)
        sys.exit(1)

    errors = []
    scope_count = 0

    for scope_path, scope_name, subscope_name in iter_scope_dirs(args.data_dir):
        label = f'{scope_name}/{subscope_name}' if subscope_name else scope_name
        print(f'scope : {label}')
        validate_scope(scope_path, scope_name, subscope_name, tunes_schema, errors)
        scope_count += 1
        print()

    print(f'scanned {scope_count} scope(s)')

    if errors:
        print(f'\n{len(errors)} error(s):')
        for err in errors:
            print(f'  ERROR: {err}')
        sys.exit(1)
    else:
        print('all checks passed')
        sys.exit(0)


if __name__ == '__main__':
    main()
