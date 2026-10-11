#!/usr/bin/env python3
"""Build the isolated signed widget companion; never rebuild/restart the recorder.

Default: prepare a private candidate. --install registers it and starts only its
own per-user helper. Existing native recorder and MCP clients are untouched.
"""
import argparse, hashlib, json, os, plistlib, shutil, signal, subprocess, tempfile
from pathlib import Path

SRC=Path(__file__).resolve().parent
ROOT=SRC.parents[2]
DATA=ROOT/'data/smart-record/widget'
APP_NAME='Smart Record Control.app'
BUNDLE='com.taylor.smart-record.control'
GROUP='H77CX8PYPV.com.taylor.smart-record.widget'
LABEL='com.taylor.smart-record.widget-host'
LSREGISTER='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

def run(*args):
 result=subprocess.run(args,capture_output=True,text=True)
 if result.returncode:raise RuntimeError(result.stdout+result.stderr)
 return result.stdout
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--install',action='store_true');p.add_argument('--upgrade',action='store_true');a=p.parse_args()
 if a.upgrade and not a.install:p.error('--upgrade requires --install')
 paths=[SRC/x for x in ['Shared.swift','ControlMailbox.swift','GateIntent.swift','Host.swift','Widget.swift','build.py']]
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
   extension=candidate/'Contents/PlugIns/SmartRecordWidget.appex';extmac=extension/'Contents/MacOS';extmac.mkdir(parents=True)
   common={'CFBundleShortVersionString':'0.20.0','CFBundleVersion':f'{int(digest[:3],16)}.{int(digest[3:5],16)%100}.{int(digest[5:7],16)%100}','LSMinimumSystemVersion':'15.0','CFBundleSupportedPlatforms':['MacOSX'],'RSWidgetBuild':digest[:12]}
   host={**common,'CFBundleIdentifier':BUNDLE,'CFBundleName':'Smart Record Control','CFBundleDisplayName':'Smart Record','CFBundleExecutable':'smart-record-control','CFBundlePackageType':'APPL','LSUIElement':True,'CFBundleURLTypes':[{'CFBundleURLName':BUNDLE,'CFBundleURLSchemes':['smart-record-control']} ]}
   widget={**common,'CFBundleIdentifier':BUNDLE+'.widget','CFBundleName':'Smart Record','CFBundleDisplayName':'Smart Record','CFBundleExecutable':'SmartRecordWidget','CFBundlePackageType':'XPC!','NSExtension':{'NSExtensionPointIdentifier':'com.apple.widgetkit-extension'}}
   (candidate/'Contents/Info.plist').write_bytes(plistlib.dumps(host));(extension/'Contents/Info.plist').write_bytes(plistlib.dumps(widget))
   host_ent=temp/'host.entitlements';widget_ent=temp/'widget.entitlements'
   host_ent.write_bytes(plistlib.dumps({'com.apple.security.application-groups':[GROUP]}))
   widget_ent.write_bytes(plistlib.dumps({'com.apple.security.application-groups':[GROUP],'com.apple.security.app-sandbox':True}))
   for name,source,dest,ent,identifier in [('host','Host.swift',mac/'smart-record-control',host_ent,BUNDLE),('widget','Widget.swift',extmac/'SmartRecordWidget',widget_ent,BUNDLE+'.widget')]:
    module='SmartRecordControl' if name=='host' else 'SmartRecordWidget'
    sources=[frozen/x for x in ['Shared.swift','ControlMailbox.swift','GateIntent.swift',source]]
    const_values=temp/(name+'.swiftconstvalues')
    toolchain=run('/usr/bin/xcrun','--find','swiftc').strip().rsplit('/usr/bin/',1)[0]
    protocol_config=json.loads((Path(toolchain)/'usr/share/swift/SwiftConstantValues/AppIntents.json').read_text())
    protocols=temp/'const-protocols.json'
    protocols.write_text(json.dumps(protocol_config['constValueProtocols']))
    args=['/usr/bin/xcrun','swiftc','-O','-whole-module-optimization','-swift-version','5','-parse-as-library','-module-name',module,'-emit-const-values-path',str(const_values),'-Xfrontend','-const-gather-protocols-file','-Xfrontend',str(protocols),'-target','arm64-apple-macos15.0','-o',str(dest),*map(str,sources)]
    # Match Xcode's app-extension product: Widget.main registers the widget,
    # while NSExtensionMain keeps the system extension connection alive.
    if name=='widget':args+=['-application-extension','-Xlinker','-e','-Xlinker','_NSExtensionMain']
    subprocess.run(args,check=True)
    source_list=temp/(name+'.sources');source_list.write_text('\n'.join(map(str,sources))+'\n')
    const_list=temp/(name+'.constants');const_list.write_text(str(const_values)+'\n')
    resources=dest.parent.parent/'Resources';resources.mkdir(exist_ok=True)
    run('/usr/bin/xcrun','appintentsmetadataprocessor','--output',str(resources),
        '--toolchain-dir',toolchain,
        '--module-name',module,'--sdk-root',run('/usr/bin/xcrun','--show-sdk-path').strip(),
        '--xcode-version',run('/usr/bin/xcodebuild','-version').strip().split()[-1],
        '--platform-family','macOS','--deployment-target','15.0','--target-triple','arm64-apple-macos15.0',
        '--source-file-list',str(source_list),'--swift-const-vals-list',str(const_list),
        '--binary-file',str(dest),'--compile-time-extraction')
    metadata=json.loads((resources/'Metadata.appintents/extract.actionsdata').read_text())
    action=metadata.get('actions',{}).get('SetRecordingGateIntent',{})
    if action.get('openAppWhenRun') is not False or not action.get('parameters'):
     raise RuntimeError('Background gate AppIntent metadata missing; no install')
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
  if hashlib.sha256(b''.join(x.name.encode()+x.read_bytes() for x in paths)).hexdigest()!=digest:raise RuntimeError('Source changed after compilation; prepared candidate retained, no install')
  # The helper is independent of recording; do not replace a running helper.
  label=f'gui/{os.getuid()}/{LABEL}'
  live=subprocess.run(['/bin/launchctl','print',label],capture_output=True).returncode==0
  if live and not a.upgrade:raise RuntimeError('Existing widget host is running; explicit --upgrade required')
  target=DATA/APP_NAME
  # WidgetKit can retain an old executable across an in-place app upgrade.
  # Remember only this installed extension's PIDs; retire them after the new
  # bundle is registered, without restarting Notification Center or chronod.
  extension_executable=str(target/'Contents/PlugIns/SmartRecordWidget.appex/Contents/MacOS/SmartRecordWidget')
  extension_pids=[]
  for line in run('/bin/ps','-axo','pid=,command=').splitlines():
   fields=line.strip().split(None,1)
   if len(fields)==2 and (fields[1]==extension_executable or fields[1].startswith(extension_executable+' ')):
    extension_pids.append(int(fields[0]))
  if target.exists():
   if not a.upgrade:raise RuntimeError('Existing companion bundle is preserved; explicit --upgrade required')
   info=plistlib.loads((target/'Contents/Info.plist').read_bytes())
   if info.get('CFBundleIdentifier')!=BUNDLE:raise RuntimeError('Unexpected bundle; no replacement')
  if live:run('/bin/launchctl','bootout',label)
  # Every prior immutable signed candidate remains under prepared/ for recovery.
  if target.exists():shutil.rmtree(target)
  shutil.copytree(app,target);run(LSREGISTER,'-f',str(target))
  for pid in extension_pids:
   current=subprocess.run(['/bin/ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout.strip()
   if current==extension_executable or current.startswith(extension_executable+' '):
    try:os.kill(pid,signal.SIGTERM)
    except ProcessLookupError:pass
  agents=Path.home()/'Library/LaunchAgents';agents.mkdir(exist_ok=True)
  logs=DATA/'logs';logs.mkdir(exist_ok=True)
  config={'Label':LABEL,'ProgramArguments':['/usr/bin/env','-i','HOME='+str(Path.home()),'PATH=/usr/bin:/bin',str(target/'Contents/MacOS/smart-record-control')],'RunAtLoad':True,'KeepAlive':True,'ProcessType':'Background','StandardOutPath':str(logs/'stdout.log'),'StandardErrorPath':str(logs/'stderr.log')}
  plist=agents/(LABEL+'.plist')
  if plist.exists() and not a.upgrade:raise RuntimeError('Existing launch agent is preserved')
  plist.write_bytes(plistlib.dumps(config));plist.chmod(0o600)
  run('/bin/launchctl','bootstrap',f'gui/{os.getuid()}',str(plist))
  result.update(installed=True,bundle=str(target),launch_agent=str(plist))
 print(json.dumps(result))
if __name__=='__main__':main()
