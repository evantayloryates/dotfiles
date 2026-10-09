"""Identity of Python code loaded by the broker, separate from dynamic SDK code."""
import hashlib
from pathlib import Path

WORKER_FILES = ('service.py', 'web/bridge.py', 'source_hash.py')

def worker_source_hash(root=None):
    root = Path(root) if root is not None else Path(__file__).resolve().parent
    digest = hashlib.sha256()
    for name in WORKER_FILES:
        digest.update(name.encode() + b'\0')
        digest.update(hashlib.sha256((root / name).read_bytes()).digest())
    return digest.hexdigest()
