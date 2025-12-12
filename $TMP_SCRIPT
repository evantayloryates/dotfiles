#!/usr/bin/env python3
import sys
import os

# args:
#   file_path
#   line_number (1-based)
#   column_number (ignored)
if len(sys.argv) < 3:
    print('Usage: insert_print_after_block.py <file> <line> <col>')
    sys.exit(1)

file_path = sys.argv[1]
line_num = int(sys.argv[2]) - 1  # convert to 0-based

with open(file_path, 'r') as f:
    lines = f.readlines()

if line_num < 0 or line_num >= len(lines):
    sys.exit(0)

# detect indent of selected line (spaces only)
selected = lines[line_num]
leading_spaces = len(selected) - len(selected.lstrip(' '))

# find next sibling line with same indent
insert_after = None
for i in range(line_num + 1, len(lines)):
    line = lines[i]
    if not line.strip():  # skip blank lines
        continue
    indent = len(line) - len(line.lstrip(' '))
    if indent == leading_spaces:
        insert_after = i
        break

# fallback -> insert at end
if insert_after is None:
    insert_after = len(lines) - 1

indent_str = ' ' * leading_spaces

# multi-line debug snippet
snippet = [
    f"{indent_str}import json, tempfile\n",
    f"{indent_str}with tempfile.NamedTemporaryFile(delete=False, suffix='.json', mode='w') as _tmp:\n",
    f"{indent_str}    json.dump(changeMe, _tmp, default=str, indent=2)\n",
    f"{indent_str}    print(f'wrote {{_tmp.name}}')\n"
]

# insert new lines
for idx, line in enumerate(snippet):
    lines.insert(insert_after + 1 + idx, line)

with open(file_path, 'w') as f:
    f.writelines(lines)

