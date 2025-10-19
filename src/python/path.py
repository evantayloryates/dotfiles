import os
import re

path_items = os.environ.get('PATH', '').split(':')
normalized = []

for item in path_items:
  # Replace multiple leading slashes with a single one
  item = re.sub(r'^/+', '/', item)
  normalized.append(item)

normalized.sort()

for i in normalized:
  print(i)
