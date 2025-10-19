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

MODEL = 'openai/gpt-4o'
API_URL = f'https://api.replicate.com/v1/models/{MODEL}/predictions'


def log(message: str):
  timestamp = datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S UTC')
  with open(LOG_FILE, 'a', encoding='utf-8') as f:
    f.write(f'[{timestamp}] {message}\n')


def _http_get(url: str):
  req = urllib.request.Request(url, headers={
    'Authorization': f'Bearer {REPLICATE_API_TOKEN}'
  })
  with urllib.request.urlopen(req) as resp:
    return json.loads(resp.read().decode('utf-8'))


def chat_with_model(user_prompt: str) -> str:
  """
  Calls the OpenAI GPT-4o model on Replicate with a stubbed system prompt and
  4 preset messages (2 user/agent back-and-forths) before the real user message.
  Returns path to a temp file containing the model's response.
  """

  system_prompt = (
    'You are a precise assistant. Respond only with what the user explicitly requests. '
    'No introductory text, no explanations, no extra formatting. Provide exactly what '
    'they asked for and nothing more.'
  )

  conversation = [
    ('User', 'what is oneliner for scaling up images with convert'),
    ('Assistant', 'convert input.jpg -resize 200% output.jpg'),
    ('User', 'how to use ripgrep in current dir to find all files with "echo" in them ?'),
    ('Assistant', 'rg "echo"'),
    ('User', user_prompt)
  ]

  conversation_text = f'System: {system_prompt}\n\n'
  for role, content in conversation:
    conversation_text += f'{role}: {content}\n'
  conversation_text += 'Assistant:'

  headers = {
    'Authorization': f'Bearer {REPLICATE_API_TOKEN}',
    'Content-Type': 'application/json'
  }

  body = json.dumps({
    'input': {
      'prompt': conversation_text,
      'temperature': 0.2,
      'max_tokens': 500
    }
  }, indent=2).encode('utf-8')

  log('--- REQUEST START ---')
  log('Flattened prompt text:')
  log(conversation_text)
  log('JSON body:')
  log(body.decode('utf-8'))

  req = urllib.request.Request(API_URL, data=body, headers=headers, method='POST')
  with urllib.request.urlopen(req) as resp:
    initial = json.loads(resp.read().decode('utf-8'))

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
  text = ''.join(part for part in output if isinstance(part, str)).strip() if isinstance(output, list) else str(output).strip()
  text = text.rstrip('\n')

  tmp_dir = os.getenv('TMPDIR', '/tmp')
  fd, path = tempfile.mkstemp(prefix='chat_', suffix='.txt', dir=tmp_dir)
  os.close(fd)
  with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

  return path


if __name__ == '__main__':
  if len(sys.argv) < 2:
    print('Usage: replicate.quick.py <input_filepath>', file=sys.stderr)
    sys.exit(1)

  input_path = sys.argv[1]
  if not os.path.isfile(input_path):
    print(f'Invalid file path: {input_path}', file=sys.stderr)
    sys.exit(1)

  try:
    with open(input_path, 'r', encoding='utf-8') as f:
      user_prompt = f.read().strip()

    file_path = chat_with_model(user_prompt)
    print(file_path, flush=True)

  except Exception as e:
    log(f'Error: {e}')
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
