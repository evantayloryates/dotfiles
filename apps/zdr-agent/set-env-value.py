#!/usr/bin/python3
"""Replace one KEY=value line in a .env file, atomically and without echoing it.

Called by `zdr-harness set-token`. The key and value arrive in the environment
(SET_KEY, SET_VALUE) rather than argv, so `ps` never shows the secret. Only a
length and a SHA-256 prefix are printed, which is enough to confirm the write
landed without putting the value on screen or in shell history.
"""
import hashlib
import os
from pathlib import Path
import sys

path = Path(sys.argv[1])
key = os.environ["SET_KEY"]
value = os.environ["SET_VALUE"]

lines = path.read_text().splitlines()
out = []
replaced = False
for line in lines:
    stripped = line.strip()
    name = stripped[len("export "):] if stripped.startswith("export ") else stripped
    if "=" in name and name.split("=", 1)[0].strip() == key:
        out.append(f"{key}={value}")
        replaced = True
    else:
        out.append(line)
if not replaced:
    out.append(f"{key}={value}")

tmp = path.with_name(path.name + ".tmp")
tmp.write_text("\n".join(out) + "\n")
os.chmod(tmp, 0o600)
tmp.replace(path)

digest = hashlib.sha256(value.encode()).hexdigest()[:12]
print(f"{key}: len={len(value)} sha12={digest} ({'replaced' if replaced else 'appended'}) in {path}")
