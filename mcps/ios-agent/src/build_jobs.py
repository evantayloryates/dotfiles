#!/usr/bin/env python3
"""Fixed, durable DEV build jobs. No phone install, app launch, sudo or XCTest."""
import argparse
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import uuid
from dev_runtime import load_config
try:
    from signals import emit_signal
except ImportError:
    emit_signal = None

ROOT=Path(__file__).resolve().parent
LOCK_ROOT=Path.home()/'Library/Application Support/ios-agent/qualification-locks'

def _signal(event, **fields):
    try:
        if emit_signal:emit_signal('host', event, **fields)
    except Exception:pass

def write(file,value):
    temporary=file.with_suffix('.next')
    with os.fdopen(os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600),'w') as stream:json.dump(value,stream)
    temporary.replace(file)

def private_base(state):
    base=state/'build-jobs';base.mkdir(parents=True,exist_ok=True,mode=0o700)
    if base.is_symlink() or base.stat().st_mode&0o077:raise ValueError('private_build_directory_required')
    return base

def plan():
    return {'ok':True,'recipe':'signed-kickoff-dev-build','scope':'configured Kickoff DEV only; no phone input or installation',
            'steps':['start once','recover/poll returned jobId across MCP connections','diagnose terminal failure before explicit retry; never retry running or unconfirmed work','require completed, signed DEV bundle, agent symbols and stable build sources','install separately at a safe phone idle point'],
            'limits':['No arbitrary command, checkout, configuration, destination or path.','No sudo, XCTest, shared service restart, automatic install or periodic build.','Build success does not establish installed identity or app readiness.']}

def status(base,job_id=None):
    if job_id is None:return {'ok':True,'jobs':[status(base,p.parent.name) for p in sorted(base.glob('*/request.json'),key=lambda p:p.stat().st_mtime,reverse=True)[:10]]}
    if not re.fullmatch('[a-f0-9]{32}',job_id):raise ValueError('invalid_job_id')
    folder=base/job_id
    if folder.is_symlink() or not (folder/'request.json').is_file():return {'ok':False,'reason':'build_job_not_found','jobId':job_id}
    if (folder/'result.json').exists():return json.loads((folder/'result.json').read_text())
    request=json.loads((folder/'request.json').read_text());pid=request.get('workerPid');alive=False
    if type(pid) is int:
        try:
            command=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','command='],text=True,timeout=3)
            alive=str(ROOT/'build_jobs.py') in command and '--worker' in command and job_id in command
        except (OSError,subprocess.SubprocessError):pass
    return {'ok':alive,'jobId':job_id,'state':'running' if alive else 'unconfirmed','startedAt':request['startedAt'],'installed':False,'replay':False,
            'next':'Poll this job; do not replay start.' if alive else 'Worker not confirmed. Inspect retained private logs and active build processes before starting another build.'}

def start(base,retry_id=None):
    LOCK_ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd=os.open(LOCK_ROOT/'native-build.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    try:
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'ok':False,'reason':'build_job_already_running','actionSent':False}
        runtime=base.parent/'dev-runtime.json';config=load_config(runtime)
        previous=None
        if retry_id:
            prior=status(base,retry_id)
            if prior.get('state')!='failed':return {'ok':False,'reason':'retry_requires_terminal_failed_build','actionSent':False}
            previous=json.loads((base/retry_id/'request.json').read_text())
            if previous.get('runtimeHash')!=hashlib.sha256(json.dumps(config).encode()).hexdigest():return {'ok':False,'reason':'retry_runtime_changed_start_fresh','actionSent':False}
            reused=previous.get('derivedDataJob',retry_id)
            # Retrying an earlier failed receipt must not overwrite a newer
            # completed product in the same incremental build cache.
            for other in base.glob('*/request.json'):
                sibling=json.loads(other.read_text())
                if sibling.get('derivedDataJob',other.parent.name)==reused and sibling.get('startedAt',0)>previous['startedAt']:
                    return {'ok':False,'reason':'retry_superseded_job_use_latest_receipt','actionSent':False}
        # Snapshot the validated configuration: a later config change cannot retarget this job.
        job_id=uuid.uuid4().hex;folder=base/job_id;folder.mkdir(mode=0o700)
        write(folder/'runtime.json',config)
        request={'jobId':job_id,'startedAt':time.time(),'mobile':config['mobile'],'runtimeHash':hashlib.sha256((folder/'runtime.json').read_bytes()).hexdigest()}
        if previous:
            reused=previous.get('derivedDataJob',retry_id)
            if not re.fullmatch('[a-f0-9]{32}',reused):raise ValueError('fixed_build_cache_required')
            request.update(derivedDataJob=reused,retryOf=retry_id)
        write(folder/'request.json',request)
        with (folder/'worker.log').open('xb') as log:
            child=subprocess.Popen([sys.executable,'-B',str(ROOT/'build_jobs.py'),'--state',str(base.parent),'--worker',job_id,'--lock-fd',str(fd)],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True,pass_fds=(fd,))
        request['workerPid']=child.pid;write(folder/'request.json',request)
        return {'ok':True,'jobId':job_id,'state':'started','installed':False,'replay':False,'next':'Poll ios_build status with jobId. Build survives MCP disconnect; no phone operations occur.'}
    finally:os.close(fd)

def work(base,job_id,lock_fd):
    folder=base/job_id;request=json.loads((folder/'request.json').read_text());child=None
    result={'ok':False,'jobId':job_id,'state':'failed','installed':False,'xctestStarted':False,'phoneInputSent':False,'replay':False}
    def stop(_signum,_frame):
        if child and child.poll() is None:os.killpg(child.pid,signal.SIGTERM)
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    try:
        runtime=folder/'runtime.json';config=load_config(runtime)
        if hashlib.sha256(runtime.read_bytes()).hexdigest()!=request['runtimeHash']:raise ValueError('build_runtime_changed')
        derived=base/request.get('derivedDataJob',job_id)/'DerivedData'
        with (folder/'runner.log').open('xb') as log:
            child=subprocess.Popen([sys.executable,'-B',str(ROOT/'build_app.py'),'--mobile',config['mobile'],'--udid','generic','--generic-destination','--runtime-config',str(runtime),'--derived-data',str(derived),'--log',str(folder/'build.log')],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True,pass_fds=(lock_fd,))
            try:code=child.wait(timeout=1200)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid,signal.SIGTERM)
                try:code=child.wait(timeout=15)
                except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait(timeout=5)
        evidence_path=derived/'ios-agent-build.json'
        fresh=evidence_path.exists() and evidence_path.stat().st_mtime>=request['startedAt']
        evidence=json.loads(evidence_path.read_text()) if fresh else {}
        product=Path(evidence.get('product') or '/missing')
        expected_parent=(derived/'Build/Products/Debug-iphoneos').resolve()
        product_valid=product.is_dir() and product.resolve().parent==expected_parent and (product/'Info.plist').is_file()
        executable_hash=None;bundle_valid=False
        if product_valid and code == 0:
            import plistlib
            info=plistlib.loads((product/'Info.plist').read_bytes());bundle_valid=info.get('CFBundleIdentifier')=='com.dev.kudos.fit'
            binary=product/info['CFBundleExecutable'];executable_hash=hashlib.sha256(binary.read_bytes()).hexdigest()
        passed=code==0 and fresh and product_valid and bundle_valid and evidence.get('sourceChangedDuringBuild') is False and all(evidence.get(k) is True for k in ['agentBinaryVerified','devCallbackRegistered','signatureVerified'])
        result.update(ok=passed,state='completed' if passed else 'failed',exitCode=code,seconds=evidence.get('seconds'),deliveryId=evidence.get('deliveryId'),buildManifestFresh=fresh,productVerified=product_valid and bundle_valid,
                      agentBinaryVerified=evidence.get('agentBinaryVerified') is True,signatureVerified=evidence.get('signatureVerified') is True,
                      devCallbackRegistered=evidence.get('devCallbackRegistered') is True,sourceChangedDuringBuild=evidence.get('sourceChangedDuringBuild'),
                      executableHash=executable_hash,sourceHashes=evidence.get('sources',{}))
    except Exception as error:result['reason']=type(error).__name__
    finally:
        seconds = result.get('seconds')
        _signal('build.terminal', outcome=result['state'], buildId=job_id,
                deliveryId=result.get('deliveryId'), reason=result.get('reason'),
                durationMs=round(seconds*1000) if type(seconds) in (int,float) and math.isfinite(seconds) and 0 <= seconds <= 1e7 else None)
        result['finishedAt']=time.time();write(folder/'result.json',result);os.close(lock_fd)

def main():
    os.umask(0o077);p=argparse.ArgumentParser();p.add_argument('--state',type=Path,required=True);p.add_argument('--worker');p.add_argument('--lock-fd',type=int);args=p.parse_args();base=private_base(args.state)
    if args.worker:
        if not re.fullmatch('[a-f0-9]{32}',args.worker) or args.lock_fd is None:raise SystemExit('fixed_worker_required')
        work(base,args.worker,args.lock_fd);return
    query=json.load(sys.stdin);action=query.get('action','plan')
    try:
        if action=='plan':result=plan()
        elif action=='start':result=start(base)
        elif action=='retry':result=start(base,query.get('jobId')) if query.get('jobId') else {'ok':False,'reason':'failed_job_id_required','actionSent':False}
        elif action=='status':result=status(base,query.get('jobId'))
        else:result={'ok':False,'reason':'fixed_build_action_required','actionSent':False}
    except Exception as error:result={'ok':False,'reason':type(error).__name__,'actionSent':False}
    if action in ('start','retry'):
        _signal('build.request', outcome='accepted' if result.get('ok') else 'refused',
                buildId=result.get('jobId'), reason=result.get('reason'), code=action)
    print(json.dumps(result))

if __name__=='__main__':main()
