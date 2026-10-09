#!/usr/bin/env python3
"""Guard/cache/backup semantics in an authored private filesystem; no live SDK/signing/install."""
import argparse,hashlib,importlib.util,json,plistlib,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=False)
spec=importlib.util.spec_from_file_location('build',Path(__file__).resolve().parents[1]/'build.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
b.APP=args.output/'data/record-screend.app';b.STAMP=args.output/'data/source.sha256';b.SRC=args.output/'source';b.SRC.mkdir();b.ENGINE_HOME=args.output/'engine'
source=b.SRC/'fixture.swift';source.write_text('// authored synthetic compilation input\n');(b.SRC/'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':b.BUNDLE_ID}));b.sources=lambda:[source];b.signing_identity=lambda:'synthetic-test-identity'
binary=b.APP/'Contents/MacOS/record-screend';binary.parent.mkdir(parents=True);binary.write_bytes(b'old authored binary');oldhash=hashlib.sha256(binary.read_bytes()).hexdigest()
(b.APP/'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':b.BUNDLE_ID}));b.STAMP.write_text('old\n')
mode='busy';calls=[];compiles=0;validations=0

def rpc(method,params=None):
 global validations
 calls.append(method)
 if method=='status':return {'engine':{'pid':100},'capabilities':None,'viewfinder':{'lanes':[]},'overlays':[]}
 if method=='record.list':return {'total':1 if mode=='busy' else 0}
 if method=='maintenance.validate':
  validations+=1
  if mode=='expire' and validations>=2:raise RuntimeError('maintenance_expired')
  if mode=='wrong-pid':return {'pid':999,'lease':{'ready':True}}
  return {'pid':100,'lease':{'ready':True}}
 raise AssertionError(method)
b.rpc=rpc

def run(command,**kwargs):
 global compiles
 if command[:2]==['/usr/bin/xcrun','swiftc']:
  compiles+=1;Path(command[command.index('-o')+1]).write_bytes(b'new authored binary')
 return subprocess.CompletedProcess(command,0,stdout='',stderr='')
b.subprocess.run=run
checks=0

def check(v):
 global checks
 assert v
 checks+=1

def refused(**kwargs):
 try:b.build(**kwargs)
 except RuntimeError:return
 raise AssertionError('delivery should refuse')
refused();check(compiles==0);check(binary.read_bytes()==b'old authored binary')
refused(legacy_idle=True);check(compiles==0)
mode='wrong-pid';refused(maintenance_token='owned');check(compiles==0)
mode='expire';validations=0;refused(maintenance_token='owned');check(compiles==1);check(binary.read_bytes()==b'old authored binary');check((b.APP.parent/'prepared'/b.source_hash()/'compiled.json').exists())
mode='valid';validations=0;path,changed=b.build(maintenance_token='owned');check(changed);check(compiles==1);check(binary.read_bytes()==b'new authored binary');check((b.APP.parent/'previous'/(oldhash+'.app')/'Contents/MacOS/record-screend').read_bytes()==b'old authored binary')
check(b.STAMP.read_text().strip()==b.source_hash());check(b.build()==(b.APP,False));check(compiles==1)
print(json.dumps({'passed':checks,'scope':'synthetic guarded refusal, expired lease preserves prepared artifact, no recompile on retry, verified prior-bundle backup and no-op current build; no live engine or actual signing'}))
(args.output/'proof.json').write_text(json.dumps({'passed':checks,'compile_count':compiles,'previous_binary_sha256':oldhash,'live_mutation':False},indent=2)+'\n')
