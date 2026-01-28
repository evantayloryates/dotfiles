import os
import re

path_items = os.environ.get('PATH', '').split(':')
normalized = []

for item in path_items:
  # Replace multiple leading slashes with a single one
  item = re.sub(r'^/+', '/', item)
  normalized.append(item)

# dedupe
normalized = list(set(normalized))


def segment_count(path):
  # split on '/', ignore empty segments
  return len([p for p in path.split('/') if p])


# sort: first by segment count, then alphabetically
normalized.sort(key=lambda p: (segment_count(p), p))

for i in normalized:
  print(i)
