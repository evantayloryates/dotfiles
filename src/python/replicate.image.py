#!/usr/bin/env python3
import json, tempfile
import os
import sys
import json
import urllib.request

REPLICATE_API_TOKEN = os.getenv('REPLICATE_API_TOKEN')
if not REPLICATE_API_TOKEN:
  print('Missing REPLICATE_API_TOKEN', file=sys.stderr)
  sys.exit(1)

MODEL = 'google/nano-banana-pro'
DEFAULTS_BY_MODEL = {
  'google/nano-banana-pro': {
    'aspect_ratio': '1:1',
    'resolution': '1K',
  }
}

API_URL = f'https://api.replicate.com/v1/models/{MODEL}/predictions'


def log_error(prefix, err):
  try:
    msg = None

    # HTTPError case
    if hasattr(err, 'read'):
      try:
        raw = err.read()
        if isinstance(raw, bytes):
          raw = raw.decode('utf-8', 'replace')
        try:
          j = json.loads(raw)
          msg = j.get('error') or j.get('message') or raw
        except Exception:
          msg = raw
      except Exception:
        msg = f'HTTP error without readable body: {getattr(err, "code", "?")}'

    # General Exception
    if msg is None:
      msg = str(err) if str(err) else repr(err)

    print(f'{prefix}: {msg}', file=sys.stderr)
  except Exception:
    # absolute last-resort fallback
    print(f'{prefix}: <unprintable error>', file=sys.stderr)


def generate_image(prompt):
  headers = {
    'Authorization': f'Bearer {REPLICATE_API_TOKEN}',
    'Content-Type': 'application/json',
    'Prefer': 'wait'
  }

  # apply model defaults safely
  defaults = DEFAULTS_BY_MODEL.get(MODEL) or {}
  aspect_ratio = defaults.get('aspect_ratio', '1:1')
  resolution = defaults.get('resolution', 'None')

  body = json.dumps({
    'input': {
      'prompt': prompt,
      'aspect_ratio': aspect_ratio,
      'resolution': resolution,
    }
  }).encode('utf-8')
  
  
  with tempfile.NamedTemporaryFile(delete=False, suffix='.json', mode='w') as _tmp:
      json.dump(body, _tmp, default=str, indent=2)
      print(f'wrote {_tmp.name}')

  req = urllib.request.Request(API_URL, data=body, headers=headers, method='POST')

  try:
    with urllib.request.urlopen(req) as resp:
      response_data = json.loads(resp.read().decode('utf-8'))
      with tempfile.NamedTemporaryFile(delete=False, suffix='.json', mode='w') as _tmp:
          json.dump(response_data, _tmp, default=str, indent=2)
          print(f'wrote {_tmp.name}')
  except Exception as e:
    log_error('API error', e)
    raise RuntimeError('Image generation failed')

  output = response_data.get('output')
  if isinstance(output, list) and output:
    return output[0]
  if isinstance(output, str):
    return output

  raise RuntimeError(f'Unexpected output format: {output!r}')


if __name__ == '__main__':
  if len(sys.argv) < 2:
    print('Usage: gen_image.py <prompt>', file=sys.stderr)
    sys.exit(1)

  prompt = ' '.join(sys.argv[1:])
  try:
    print(generate_image(prompt))
  except Exception as e:
    log_error('Fatal', e)
    sys.exit(1)
