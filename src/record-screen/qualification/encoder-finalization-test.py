#!/usr/bin/env python3
"""Frozen private compile and offscreen finalization proof. Never installs."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

parser=argparse.ArgumentParser()
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[3]
kit=Path(__file__).resolve().parent
stage=args.output.resolve()
stage.mkdir(parents=True,exist_ok=False)
source=stage/'source';source.mkdir()
paths=sorted([*(root/'src/record-screen/engine/Sources').glob('*.swift'),*(root/'src/codex-bridge/native').glob('*.swift')])
copied=[]
for path in paths:
 if path.name=='main.swift':continue
 dest=source/path.name
 shutil.copy2(path,dest)
 if path.name=='Recording.swift':dest.write_text(dest.read_text()+'\n'+(kit/'encoder-finalization-fixture.swift.txt').read_text())
 if path.name=='Recordings.swift':dest.write_text(dest.read_text()+'\n'+(kit/'encoder-admission-fixture.swift.txt').read_text())
 copied.append(dest)
main=source/'encoder-finalization-test.swift';shutil.copy2(kit/main.name,main)
copied.append(main)
(stage/'source-hashes.json').write_text(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in copied},indent=2)+'\n')
command=['/usr/bin/xcrun','swiftc','-O','-swift-version','5','-target','arm64-apple-macos15.0','-D','RECORD_SCREEN_QUALIFICATION','-parse-as-library','-o',str(stage/'encoder-test'),*map(str,copied)]
with (stage/'compile.log').open('w') as log:
 subprocess.run(command,stdout=log,stderr=log,check=True,timeout=180)
with (stage/'stdout.json').open('w') as out,(stage/'stderr.log').open('w') as err:
 subprocess.run([str(stage/'encoder-test'),str(stage/'evidence')],stdout=out,stderr=err,check=True,timeout=30)
subprocess.run(['python3',str(kit/'verify-encoder-finalization.py'),'--evidence',str(stage/'evidence'),'--output',str(stage/'packet-proof.json')],check=True,timeout=60)
print((stage/'stdout.json').read_text().strip())
