#!/usr/bin/env python3
import os
import sys
import json
import random
import string
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')

MODEL = 'gpt-oss-120b'
API_URL = 'https://api.cerebras.ai/v1/chat/completions'


def gen_id():
    return ''.join(random.choices(string.ascii_letters + string.digits, k=6))


def scope_dir(scope, subscope):
    if subscope:
        return os.path.join(DATA_DIR, scope, 'subscopes', subscope)
    return os.path.join(DATA_DIR, scope)


def load_scope_files(scope, subscope):
    sdir = scope_dir(scope, subscope)
    system_path = os.path.join(sdir, 'system.txt')
    tunes_path = os.path.join(sdir, 'tunes.jsonl')
    schema_path = os.path.join(sdir, 'schema.json')

    if not os.path.isfile(system_path):
        raise FileNotFoundError(f'system prompt not found: {system_path}')
    if not os.path.isfile(tunes_path):
        raise FileNotFoundError(f'tunes file not found: {tunes_path}')

    with open(system_path, 'r', encoding='utf-8') as f:
        system_prompt = f.read().strip()

    tuning_messages = []
    with open(tunes_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            tuning_messages.append({'role': entry['role'], 'content': entry['content']})

    schema = None
    if os.path.isfile(schema_path):
        with open(schema_path, 'r', encoding='utf-8') as f:
            inner_schema = json.load(f)
        schema = {
            'type': 'object',
            'properties': {'result': inner_schema},
            'required': ['result'],
        }

    return system_prompt, tuning_messages, schema


def log_case(scope, subscope, case_id, system_text, input_text, output, metadata):
    cases_path = os.path.join(scope_dir(scope, subscope), 'cases.jsonl')
    entry = {
        'id': case_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'system_text': system_text,
        'input': input_text,
        'output': output,
        'metadata': metadata,
    }
    with open(cases_path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry) + '\n')


def call_api(prompt, scope, subscope, debug):
    token = os.getenv('CEREBRAS_TOKEN')
    if not token:
        print('error: CEREBRAS_TOKEN environment variable not set', file=sys.stderr)
        sys.exit(1)

    cache_key = f'cerebras-{scope}-{subscope}' if subscope else f'cerebras-{scope}'
    system_prompt, tuning_messages, schema = load_scope_files(scope, subscope)

    if debug and schema:
        print(f'[debug] schema loaded: {json.dumps(schema)}', file=sys.stderr)

    messages = [{'role': 'system', 'content': system_prompt}]
    messages.extend(tuning_messages)
    messages.append({'role': 'user', 'content': prompt})

    request_body = {
        'model': MODEL,
        'messages': messages,
        'prompt_cache_key': cache_key,
    }

    if schema:
        request_body['response_format'] = {
            'type': 'json_schema',
            'json_schema': {
                'name': 'cerebras_result',
                'schema': schema,
            },
        }

    req = urllib.request.Request(
        API_URL,
        data=json.dumps(request_body).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'User-Agent': 'cerebras-client/1.0',
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(req) as resp:
            resp_headers = dict(resp.headers)
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body_text = e.read().decode('utf-8', errors='replace')
        print(f'error: HTTP {e.code} from Cerebras API: {body_text}', file=sys.stderr)
        sys.exit(1)

    time_info = data.get('time_info', {})
    usage = data.get('usage', {})

    if debug:
        cached_tokens = usage.get('prompt_tokens_details', {}).get('cached_tokens', 'n/a')
        print(f'[debug] model: {data.get("model")}', file=sys.stderr)
        print(f'[debug] prompt_tokens: {usage.get("prompt_tokens")}  cached_tokens: {cached_tokens}', file=sys.stderr)
        print(f'[debug] completion_tokens: {usage.get("completion_tokens")}', file=sys.stderr)
        print(f'[debug] prompt_time: {time_info.get("prompt_time"):.4f}s  total_time: {time_info.get("total_time"):.4f}s', file=sys.stderr)
        cache_headers = {k: v for k, v in resp_headers.items() if 'cache' in k.lower()}
        if cache_headers:
            print(f'[debug] cache headers: {cache_headers}', file=sys.stderr)

    raw_content = data['choices'][0]['message']['content']

    if schema:
        result = json.loads(raw_content)['result']
    else:
        result = raw_content.strip()

    case_id = gen_id()
    log_case(
        scope=scope,
        subscope=subscope,
        case_id=case_id,
        system_text=system_prompt,
        input_text=prompt,
        output=result,
        metadata={
            'model': data.get('model'),
            'usage': usage,
            'time_info': time_info,
            'prompt_cache_key': cache_key,
            'reasoning': data['choices'][0]['message'].get('reasoning'),
        },
    )

    if debug:
        print(f'[debug] case logged: {case_id}', file=sys.stderr)

    return result


def main():
    parser = argparse.ArgumentParser(description='Cerebras gpt-oss-120b client')
    parser.add_argument('--prompt')
    parser.add_argument('--scope')
    parser.add_argument('--subscope')
    parser.add_argument('--debug', action='store_true')
    args = parser.parse_args()

    errors = []

    if not args.prompt or len(args.prompt.strip()) == 0:
        errors.append('--prompt is required and must be a non-empty string')

    if not args.scope:
        errors.append('--scope is required')
        if args.subscope:
            print('warning: --subscope ignored because --scope was not provided', file=sys.stderr)

    if errors:
        for err in errors:
            print(f'error: {err}', file=sys.stderr)
        sys.exit(1)

    result = call_api(args.prompt.strip(), args.scope, args.subscope, args.debug)

    if isinstance(result, str):
        print(result)
    else:
        print(json.dumps(result))


if __name__ == '__main__':
    main()
