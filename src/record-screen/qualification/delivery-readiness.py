#!/usr/bin/env python3
"""Read-only live delivery inventory. Never installs, restarts or stops work."""
import argparse
from datetime import datetime,timezone
import importlib.util
import json
from pathlib import Path
import socket
import subprocess


def call(sockpath,method,params=None):
 with socket.socket(socket.AF_UNIX) as sock:
  sock.settimeout(5);sock.connect(str(sockpath));sock.sendall((json.dumps({'id':1,'method':method,'params':params or {}})+'\n').encode());data=b''
  while b'\n' not in data:
   part=sock.recv(65536)
   if not part:raise RuntimeError('closed before reply')
   data+=part
   if len(data)>2_000_000:raise RuntimeError('response byte limit')
  reply=json.loads(data.split(b'\n')[0])
  if 'error' in reply:raise RuntimeError(reply['error']['code'])
  return reply['result']


def assess(status,jobs,after):
 reasons=[];unknown=[]
 same=status.get('engine',{}).get('pid')==after.get('engine',{}).get('pid') and status.get('engine',{}).get('build')==after.get('engine',{}).get('build')
 if not same:reasons.append('engine changed during observation')
 if type(jobs.get('total')) is not int:unknown.append('active recording count')
 elif jobs['total']!=0:reasons.append('active or scheduled recordings exist')
 vf=after.get('viewfinder')
 if not isinstance(vf,dict) or not isinstance(vf.get('lanes'),list):unknown.append('preview lanes')
 elif vf['lanes']:reasons.append('preview lanes exist')
 for field in ['retiring','quarantined']:
  if not isinstance(vf,dict) or field not in vf:unknown.append('preview '+field)
  elif type(vf[field]) is not int:unknown.append('preview '+field+' type')
  elif vf[field]!=0:reasons.append('preview '+field+' is nonzero')
 for path in [('capture_health','recordings','unfinished'),('capture_health','recordings','quarantined'),('capture_health','discovery','inflight'),('capture_health','discovery','quarantined'),('capture_health','export_child','pending'),('capture_health','export_child','quarantined'),('input_timeline','subscribers'),('input_timeline','queued'),('action_timeline','active')]:
  value=after
  for key in path:value=value.get(key) if isinstance(value,dict) else None
  is_bool=path in [('capture_health','discovery','inflight'),('capture_health','discovery','quarantined'),('capture_health','export_child','pending'),('capture_health','export_child','quarantined')]
  if type(value) is not (bool if is_bool else int):unknown.append('.'.join(path))
  elif value != 0:reasons.append('.'.join(path)+' is nonzero')
 if after.get('permission',{}).get('screen_recording')!='granted':reasons.append('existing screen grant not confirmed')
 if not isinstance(after.get('overlays'),list):unknown.append('overlays')
 elif after['overlays']:reasons.append('owned overlays exist')
 return {'same_engine':same,'observed_active_recordings':jobs.get('total'),'busy_reasons':reasons,'unobservable_fields':unknown,
  'observed_visible_idle':same and jobs.get('total')==0 and isinstance(vf,dict) and vf.get('lanes')==[],
  'known_diagnostics_idle':not reasons and not unknown,'admission_fenced':False,'automatic_restart_authorized':False,
  'limits':['Read-only snapshots do not reserve an idle boundary; revalidate immediately before delivery','Legacy missing diagnostics remain unknown, not zero','No installation, backup, restart, stop, cancellation or grant request was performed']}


def signature(app):
 subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(app)],capture_output=True,check=True,timeout=10)
 result=subprocess.run(['/usr/bin/codesign','--display','--verbose=4',str(app)],capture_output=True,text=True,check=True,timeout=10)
 fields={}
 for line in (result.stdout+'\n'+result.stderr).splitlines():
  if '=' in line:
   key,value=line.split('=',1)
   if key in ['Identifier','TeamIdentifier','CDHash']:fields[key]=value
 return fields


def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--candidate',type=Path,required=True)
 parser.add_argument('--output',type=Path,required=True)
 parser.add_argument('--socket',type=Path,default=Path.home()/'.record-screen/run/engine.sock')
 args=parser.parse_args()
 args.output.mkdir(parents=True,exist_ok=False)
 status=call(args.socket,'status');jobs=call(args.socket,'record.list',{'active':True,'limit':50});after=call(args.socket,'status')
 for name,value in [('status-before',status),('active-recordings',jobs),('status-after',after)]:
  (args.output/(name+'.json')).write_text(json.dumps(value,indent=2)+'\n')
 candidate_sig=signature(args.candidate.resolve());installed=Path(after['engine']['bundle_path']).resolve();installed_sig=signature(installed)
 spec=importlib.util.spec_from_file_location('rsbuild',Path(__file__).resolve().parents[1]/'build.py');build=importlib.util.module_from_spec(spec);spec.loader.exec_module(build)
 import plistlib
 info=plistlib.loads((args.candidate/'Contents/Info.plist').read_bytes())
 assessment=assess(status,jobs,after)
 assessment.update(observed_at=datetime.now(timezone.utc).isoformat(),installed_build=after['engine']['build'],installed_pid=after['engine']['pid'],candidate_build=info.get('RSBuildHash'),candidate_stamp_matches_current_source=info.get('RSBuildHash')==build.source_hash()[:12],candidate_signature=candidate_sig,installed_signature=installed_sig,signature_identity_matches=candidate_sig.get('Identifier')=='com.taylor.record-screen' and installed_sig.get('Identifier')==candidate_sig['Identifier'] and candidate_sig.get('TeamIdentifier') not in [None,'not set',''] and candidate_sig.get('TeamIdentifier')==installed_sig.get('TeamIdentifier'))
 (args.output/'assessment.json').write_text(json.dumps(assessment,indent=2)+'\n')
 print(json.dumps({k:assessment[k] for k in ['installed_build','installed_pid','candidate_build','candidate_stamp_matches_current_source','signature_identity_matches','observed_visible_idle','known_diagnostics_idle','unobservable_fields','admission_fenced','automatic_restart_authorized']}))

if __name__=='__main__':main()
