#!/usr/bin/env python3
"""Freeze/sign a candidate outside the installed bundle. Never installs or requests grants."""
import argparse
import hashlib
import importlib.util
import json
import plistlib
from pathlib import Path
import shutil
import subprocess

parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parents[3];stage=args.output.resolve();stage.mkdir(parents=True,exist_ok=False)
spec=importlib.util.spec_from_file_location('builder',root/'src/record-screen/build.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
digest=b.source_hash();source=stage/'source';source.mkdir();paths=b.sources();frozen=[]
for path in [*paths,b.SRC/'Info.plist',root/'src/record-screen/build.py']:
    dest=source/path.name;shutil.copy2(path,dest);frozen.append(dest)
h=hashlib.sha256()
for p in frozen:h.update(p.name.encode());h.update(p.read_bytes())
assert h.hexdigest()==digest,'source changed during freeze; no build'
(stage/'source-hashes.json').write_text(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in frozen},indent=2)+'\n')
app=stage/'record-screend.app';macos=app/'Contents/MacOS';macos.mkdir(parents=True)
info=plistlib.loads((source/'Info.plist').read_bytes());info['RSBuildHash']=digest[:12];(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
with (stage/'compile.log').open('w') as log:
    subprocess.run(['/usr/bin/xcrun','swiftc','-O','-swift-version','5','-target','arm64-apple-macos15.0','-o',str(macos/'record-screend'),*[str(source/p.name) for p in paths]],stdout=log,stderr=log,check=True,timeout=180)
identity=b.signing_identity();assert identity!='-','existing development identity required'
subprocess.run(['/usr/bin/codesign','--force','--sign',identity,'--identifier',b.BUNDLE_ID,'--timestamp=none',str(app)],capture_output=True,check=True)
subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(app)],capture_output=True,check=True)
receipt={'source_sha256':digest,'binary_sha256':hashlib.sha256((macos/'record-screend').read_bytes()).hexdigest(),'signed':True,'qualification_hooks':False,'installed':False,'app':str(app)}
(stage/'compiled.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
