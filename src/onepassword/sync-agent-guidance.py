#!/usr/bin/python3
"""Keep the shared 1Password contract identical in both user-level guides."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
BEGIN = '<!-- shared-onepassword:start -->'
END = '<!-- shared-onepassword:end -->'

def reconcile(text, contract):
    block = BEGIN + '\n' + contract.rstrip() + '\n' + END
    if BEGIN in text or END in text:
        if text.count(BEGIN) != 1 or text.count(END) != 1:
            raise ValueError('Ambiguous shared 1Password markers; refusing rewrite')
        start, end = text.index(BEGIN), text.index(END)
        if start >= end:
            raise ValueError('Reversed shared 1Password markers')
        return text[:start] + block + text[end + len(END):]
    if len(re.findall(r'^## 1Password[^\n]*$', text, re.M)) > 1:
        raise ValueError('Multiple legacy 1Password sections; refusing rewrite')
    match = re.search(r'^## 1Password[^\n]*\n.*?(?=^## |\Z)', text, re.M | re.S)
    if match:
        return text[:match.start()] + block + '\n\n' + text[match.end():]
    return text.rstrip() + '\n\n' + block + '\n'

if __name__ == '__main__':
    contract = (ROOT / 'agent-contract.md').read_text()
    targets = [Path.home() / '.claude/CLAUDE.md', Path.home() / '.codex/AGENTS.md']
    for target in targets:
        old = target.read_text()
        new = reconcile(old, contract)
        if new != old:
            target.write_text(new)
            print('Updated', target)
        else:
            print('Already current', target)
