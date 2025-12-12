#!/usr/bin/env python3

import os
import sys
import json
import urllib.request

REPLICATE_API_TOKEN = os.getenv('REPLICATE_API_TOKEN')
if not REPLICATE_API_TOKEN:
  print('Missing REPLICATE_API_TOKEN', file=sys.stderr)
  sys.exit(1)


# MODEL = 'ideogram-ai/ideogram-v3-turbo'
MODEL = 'google/nano-banana-pro'
API_URL = f'https://api.replicate.com/v1/models/{MODEL}/predictions'

def generate_image(prompt: str) -> str:
  headers = {
    'Authorization': f'Bearer {REPLICATE_API_TOKEN}',
    'Content-Type': 'application/json',
    'Prefer': 'wait'
  }

  body = json.dumps({
    'input': {
      'prompt': prompt,
      'aspect_ratio': '1:1',
      'resolution': 'None',
      'style_type': 'None',
      'style_preset': 'None',
      'magic_prompt_option': 'Auto'
    }
  }).encode('utf-8')

  req = urllib.request.Request(API_URL, data=body, headers=headers, method='POST')
  with urllib.request.urlopen(req) as resp:
    response_data = json.loads(resp.read().decode('utf-8'))

  output = response_data.get('output')
  if isinstance(output, list) and output:
    return output[0]
  elif isinstance(output, str):
    return output
  else:
    raise RuntimeError(f'Unexpected output format: {output!r}')

if __name__ == '__main__':
  if len(sys.argv) < 2:
    print('Usage: gen_image.py <prompt>', file=sys.stderr)
    sys.exit(1)

  prompt = ' '.join(sys.argv[1:])
  try:
    print(generate_image(prompt))
  except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
