#!/usr/bin/env python3
import os
import sys
import json
import time
import tempfile
import urllib.request
from datetime import datetime, UTC

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(SCRIPT_DIR, 'log.txt')

REPLICATE_API_TOKEN = os.getenv('REPLICATE_API_TOKEN')
if not REPLICATE_API_TOKEN:
  print('Missing REPLICATE_API_TOKEN', file=sys.stderr)
  sys.exit(1)

MODEL = 'deepseek-ai/deepseek-v3.1'
API_URL = f'https://api.replicate.com/v1/models/{MODEL}/predictions'


def log(message: str):
  """Append timestamped log messages to log.txt"""
  timestamp = datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S UTC')
  with open(LOG_FILE, 'a', encoding='utf-8') as f:
    f.write(f'[{timestamp}] {message}\n')


def _http_get(url: str):
  req = urllib.request.Request(url, headers={
    'Authorization': f'Bearer {REPLICATE_API_TOKEN}'
  })
  with urllib.request.urlopen(req) as resp:
    return json.loads(resp.read().decode('utf-8'))


def generate_text(prompt: str) -> str:
  if not prompt.lower().startswith('research'):
    prompt = f'research {prompt}'

  headers = {
    'Authorization': f'Bearer {REPLICATE_API_TOKEN}',
    'Content-Type': 'application/json'
  }

  body = json.dumps({
    'input': {
      'prompt': prompt,
      'temperature': 0.7,
      'max_tokens': 500
    }
  }).encode('utf-8')

  req = urllib.request.Request(API_URL, data=body, headers=headers, method='POST')
  with urllib.request.urlopen(req) as resp:
    initial = json.loads(resp.read().decode('utf-8'))

  log('--- REQUEST START ---')
  log(f'Prompt: {prompt}')
  log('Initial response JSON:')
  log(json.dumps(initial, indent=2))

  get_url = initial.get('urls', {}).get('get')
  if not get_url:
    raise RuntimeError('No polling URL found in response')

  status = initial.get('status')
  data = initial
  for _ in range(60):
    if status in ('succeeded', 'failed', 'canceled'):
      break
    time.sleep(2)
    data = _http_get(get_url)
    status = data.get('status')

  log(f'Final status: {status}')
  log('Final response JSON:')
  log(json.dumps(data, indent=2))
  log('--- REQUEST END ---\n')

  if status != 'succeeded':
    raise RuntimeError(f'Model did not complete successfully (status={status})')

  output = data.get('output')
  if isinstance(output, list):
    text = ''.join(part for part in output if isinstance(part, str)).strip()
  elif isinstance(output, str):
    text = output.strip()
  else:
    raise RuntimeError(f'Unexpected output format: {output!r}')

  tmp_dir = os.getenv('TMPDIR', '/tmp')
  fd, path = tempfile.mkstemp(prefix='research_', suffix='.txt', dir=tmp_dir)
  os.close(fd)
  with open(path, 'w', encoding='utf-8') as f:
    f.write(text + '\n')

  return path


if __name__ == '__main__':
  if len(sys.argv) < 2:
    print('Usage: replicate.research.py <input_filepath>', file=sys.stderr)
    sys.exit(1)

  input_path = sys.argv[1]
  if not os.path.isfile(input_path):
    print(f'Invalid file path: {input_path}', file=sys.stderr)
    sys.exit(1)

  try:
    with open(input_path, 'r', encoding='utf-8') as f:
      prompt = f.read().strip()

    file_path = generate_text(prompt)
    print(file_path, flush=True)

  except Exception as e:
    log(f'Error: {e}')
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
