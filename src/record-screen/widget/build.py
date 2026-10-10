#!/usr/bin/env python3
"""Build the isolated signed widget companion; never rebuild/restart the recorder.

Default: prepare a private candidate. --install registers it and starts only its
own per-user helper. Existing native recorder and MCP clients are untouched.
"""
import argparse, hashlib, json, os, plistlib, shutil, subprocess, tempfile
from pathlib import Path

SRC=Path(__file__).resolve().parent
ROOT=SRC.parents[2]
DATA=ROOT/'data/record-screen/widget'
APP_NAME='Record Screen Control.app'
BUNDLE='com.taylor.record-screen.control'
GROUP='H77CX8PYPV.com.taylor.record-screen.widget'
LABEL='com.taylor.record-screen.widget-host'
LSREGISTER='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

def run(*args):return subprocess.run(args,check=True,capture_output=True,text=True).stdout
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--install',action='store_true');a=p.parse_args()
 paths=[SRC/'Shared.swift',SRC/'Host.swift',SRC/'Widget.swift',Path(__file__)]
 digest=hashlib.sha256(b''.join(x.name.encode()+x.read_bytes() for x in paths)).hexdigest()
 prepared=DATA/'prepared'/digest;app=prepared/APP_NAME
 identity=next(line.split()[1] for line in run('/usr/bin/security','find-identity','-v','-p','codesigning').splitlines() if '"Apple Development:' in line)
 if not app.exists():
  prepared.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(prefix='.compile-',dir=prepared) as tmp:
   temp=Path(tmp);frozen=temp/'inputs';frozen.mkdir()
   for file in paths:shutil.copy2(file,frozen/file.name)
   assert hashlib.sha256(b''.join(x.name.encode()+(frozen/x.name).read_bytes() for x in paths)).hexdigest()==digest
   candidate=temp/APP_NAME;mac=candidate/'Contents/MacOS';mac.mkdir(parents=True)
   extension=candidate/'Contents/PlugIns/RecordScreenWidget.appex';extmac=extension/'Contents/MacOS';extmac.mkdir(parents=True)
   common={'CFBundleShortVersionString':'0.20.0','CFBundleVersion':'1','LSMinimumSystemVersion':'15.0','RSWidgetBuild':digest[:12]}
   host={**common,'CFBundleIdentifier':BUNDLE,'CFBundleName':'Record Screen Control','CFBundleDisplayName':'Screen recording','CFBundleExecutable':'record-screen-control','CFBundlePackageType':'APPL','LSUIElement':True,'CFBundleURLTypes':[{'CFBundleURLName':BUNDLE,'CFBundleURLSchemes':['record-screen-control']} ]}
   widget={**common,'CFBundleIdentifier':BUNDLE+'.widget','CFBundleName':'Screen recording','CFBundleDisplayName':'Screen recording','CFBundleExecutable':'RecordScreenWidget','CFBundlePackageType':'XPC!','NSExtension':{'NSExtensionPointIdentifier':'com.apple.widgetkit-extension'}}
   (candidate/'Contents/Info.plist').write_bytes(plistlib.dumps(host));(extension/'Contents/Info.plist').write_bytes(plistlib.dumps(widget))
   host_ent=temp/'host.entitlements';widget_ent=temp/'widget.entitlements'
   host_ent.write_bytes(plistlib.dumps({'com.apple.security.application-groups':[GROUP]}))
   widget_ent.write_bytes(plistlib.dumps({'com.apple.security.application-groups':[GROUP],'com.apple.security.app-sandbox':True}))
   for name,source,dest,ent,identifier in [('host','Host.swift',mac/'record-screen-control',host_ent,BUNDLE),('widget','Widget.swift',extmac/'RecordScreenWidget',widget_ent,BUNDLE+'.widget')]:
    args=['/usr/bin/xcrun','swiftc','-O','-swift-version','5','-parse-as-library','-target','arm64-apple-macos15.0','-o',str(dest),str(frozen/'Shared.swift'),str(frozen/source)]
    if name=='widget':args+=['-application-extension']
    subprocess.run(args,check=True)
   run('/usr/bin/codesign','--force','--sign',identity,'--identifier',BUNDLE+'.widget','--entitlements',str(widget_ent),'--timestamp=none',str(extension))
   run('/usr/bin/codesign','--force','--sign',identity,'--identifier',BUNDLE,'--entitlements',str(host_ent),'--timestamp=none',str(candidate))
   sig=subprocess.run(['/usr/bin/codesign','-d','--verbose=4',str(candidate)],capture_output=True,text=True,check=True).stderr
   if 'TeamIdentifier=H77CX8PYPV' not in sig:raise RuntimeError('Existing signing team differs from app group; no install')
   run('/usr/bin/codesign','--verify','--deep','--strict',str(candidate))
   shutil.move(str(candidate),app)
  (prepared/'receipt.json').write_text(json.dumps({'source_sha256':digest,'native_recorder_unchanged':True})+'\n')
 run('/usr/bin/codesign','--verify','--deep','--strict',str(app))
 result={'candidate':str(app),'widget_build':digest[:12],'group':GROUP,'installed':False}
 if a.install:
  # The helper is independent of recording; do not replace a running helper.
  label=f'gui/{os.getuid()}/{LABEL}'
  live=subprocess.run(['/bin/launchctl','print',label],capture_output=True).returncode==0
  if live:raise RuntimeError('Existing widget host is running; use its deliberate upgrade boundary before replacing it')
  target=DATA/APP_NAME
  if target.exists():raise RuntimeError('Existing companion bundle is preserved; choose an explicit upgrade')
  shutil.copytree(app,target);run(LSREGISTER,'-f',str(target))
  agents=Path.home()/'Library/LaunchAgents';agents.mkdir(exist_ok=True)
  logs=DATA/'logs';logs.mkdir(exist_ok=True)
  config={'Label':LABEL,'ProgramArguments':[str(target/'Contents/MacOS/record-screen-control')],'RunAtLoad':True,'KeepAlive':True,'ProcessType':'Background','StandardOutPath':str(logs/'stdout.log'),'StandardErrorPath':str(logs/'stderr.log')}
  plist=agents/(LABEL+'.plist')
  if plist.exists():raise RuntimeError('Existing launch agent is preserved')
  plist.write_bytes(plistlib.dumps(config));plist.chmod(0o600)
  run('/bin/launchctl','bootstrap',f'gui/{os.getuid()}',str(plist))
  result.update(installed=True,bundle=str(target),launch_agent=str(plist))
 print(json.dumps(result))
if __name__=='__main__':main()
