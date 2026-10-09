#!/usr/bin/env python3
"""Explicit, serialized recovery of the existing guarded local demo backend.

Never stops Docker, replaces containers, seeds, resets, or kills other workers.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import time
from urllib.parse import urlsplit
from cli import request
from dev_runtime import load_config
from install_runtime import probe, verify_local_backend
from service import STATE


class StackError(RuntimeError):
    pass


ENV = ['APP_ENV=development', 'KICKOFF_LOCAL_DATABASE_ONLY=1',
       'KICKOFF_SKIP_REMOTE_SECRETS=1', 'DB_DISABLE_SSL=true', 'DISABLE_LOGS=true']


def run(args, timeout=10, input=None):
    try:
        result = subprocess.run(args, input=input, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        raise StackError('local_command_outcome_unconfirmed') from None
    if result.returncode:
        raise StackError('local_command_failed')
    return result.stdout


def checked_mount(mounts, checkout):
    for mount in mounts:
        source = mount.get('Source', '')
        if source.startswith('/host_mnt/'):
            source = source[len('/host_mnt'):]
        if mount.get('Destination') == '/workspaces/kickoff' and mount.get('Type') == 'bind' and Path(source).resolve() == checkout.resolve():
            return True
    return False


def local_desktop_endpoint(endpoint):
    """The context name alone does not establish a local daemon."""
    value = urlsplit(endpoint)
    return (value.scheme == 'unix' and not value.netloc and not value.query
            and not value.fragment and Path(value.path).resolve() ==
            (Path.home() / '.docker/run/docker.sock').resolve())


def require_idle_host(state=STATE):
    status = request({'op': 'status'}, state, timeout=2)
    if (status.get('lease') is not None or
            status.get('reactFrontendRunning') is not False or
            status.get('reactFrontendCleanupPending') is not False):
        raise StackError('idle_host_required_for_stack_recovery')


def inspect_processes(container):
    classifier = (Path(__file__).parent / 'process_inventory.mjs').read_text().replace('export function', 'function')
    script = classifier + r'''
const fs=require('fs'),records=[];
for(const p of fs.readdirSync('/proc').filter(v=>/^\d+$/.test(v))){try{
 const args=fs.readFileSync(`/proc/${p}/cmdline`,'utf8').split('\0').filter(Boolean);
 const cwd=fs.readlinkSync(`/proc/${p}/cwd`);
 const parent=fs.readFileSync(`/proc/${p}/stat`,'utf8').match(/^\d+ \(.*\) \S+ (\d+)/)?.[1];
 const env=fs.readFileSync(`/proc/${p}/environ`,'utf8').split('\0');
 const envPort=env.find(v=>v.startsWith('PORT='))?.slice(5);
 records.push({pid:p,parent,cwd,args,envPort});
}catch{}}
process.stdout.write(JSON.stringify(countProcesses(records)));
'''
    return json.loads(run(['docker', 'exec', '-i', container, 'node', '-'], input=script.encode()))


def local_identity(container):
    script = r'''
const c=require('./scripts/lib/dev-access-contract.cjs');
const identity=c.parseDatabaseIdentity(process.env);
if(identity.host!=='db'||identity.schema!=='kudos_development')throw Error('exact_local_required');
const db=require('knex')({client:'mysql2',connection:identity.url});
(async()=>{await c.assertLocalIdentity(db);await db.destroy();process.stdout.write('{"verified":true}');})().catch(()=>process.exit(1));
'''
    args = ['docker', 'exec', '-i']
    for value in ENV:
        args += ['-e', value]
    args += ['-w', '/workspaces/kickoff/node', container, 'node', '-']
    if json.loads(run(args, input=script.encode())).get('verified') is not True:
        raise StackError('existing_local_identity_required')


def occupied(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=1):
            return True
    except OSError:
        return False


def known_web_forwarder(container):
    """A listening Docker proxy is not proof of a live Next worker.

    Admit only the existing loopback-bound, exact-container socat route, and
    require the target port inside that verified container to be free.
    """
    try:
        info = json.loads(run(['docker', 'inspect', 'kickoff-port-bridge-3000']))[0]
        if (info['Config']['Image'] != 'alpine/socat' or
                info['Config']['Cmd'] != ['TCP-LISTEN:3000,fork,reuseaddr', 'TCP:' + container + ':3000'] or
                info['NetworkSettings']['Ports'].get('3000/tcp') != [{'HostIp': '127.0.0.1', 'HostPort': '3000'}]):
            return False
        script = "const net=require('net'),s=net.connect(3000,'127.0.0.1');s.setTimeout(1000);s.on('connect',()=>{s.destroy();process.stdout.write('busy')});s.on('error',e=>{process.stdout.write(e.code==='ECONNREFUSED'?'free':'unknown')});s.on('timeout',()=>{s.destroy();process.stdout.write('unknown')});"
        return run(['docker', 'exec', container, 'node', '-e', script]).decode() == 'free'
    except (StackError, KeyError, ValueError, IndexError):
        return False


def start(container, project):
    args = ['docker', 'exec', '-d']
    for value in ENV:
        args += ['-e', value]
    args += ['-w', '/workspaces/kickoff/' + project, container, 'sh', '-c',
             'exec yarn start:demo:development </dev/null >/dev/null 2>&1']
    run(args)


def ensure_backend(container, timeout=90, before_launch=None):
    local_identity(container)
    counts = inspect_processes(container)
    started = []
    if counts['server']:
        # An existing unguarded server is a refusal, never a replacement target.
        verify_local_backend(container)
    launch_graphql = not counts['server'] and not counts['starter']
    launch_web = not counts['web']
    if launch_graphql:
        if occupied(4000):
            raise StackError('graphql_port_owner_unverified')
    if launch_web:
        if occupied(3000) and not known_web_forwarder(container):
            raise StackError('web_port_owner_unverified')
    if launch_graphql:
        if before_launch:
            before_launch()
        start(container, 'node'); started.append('graphql')
    if launch_web:
        if before_launch:
            before_launch()
        start(container, 'next'); started.append('web')
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            verify_local_backend(container)
            if probe('http://127.0.0.1:4000/development/graphql', graphql=True) and probe('http://127.0.0.1:3000/sign-in'):
                return {'backendReady': True, 'localIdentityVerified': True,
                        'guardedProcessVerified': True, 'started': started,
                        'dataReset': False, 'workersStopped': False}
        except (ValueError, OSError, subprocess.SubprocessError):
            pass
        time.sleep(0.5)
    raise StackError('backend_startup_not_ready; inspect_doctor_before_retry')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, default=STATE)
    parser.add_argument('--backend-container', default='default-ki-e3ee9-dev-1')
    parser.add_argument('--timeout', type=int, default=90)
    args = parser.parse_args()
    if not 5 <= args.timeout <= 120:
        raise StackError('timeout_out_of_bounds')
    if os.environ.get('DOCKER_HOST') or (os.environ.get('DOCKER_CONTEXT') and os.environ['DOCKER_CONTEXT'] != 'desktop-linux'):
        raise StackError('remote_docker_override_not_supported')
    if run(['docker', 'context', 'show']).decode().strip() != 'desktop-linux':
        raise StackError('existing_local_desktop_context_required')
    endpoint = run(['docker', 'context', 'inspect', 'desktop-linux', '--format',
                    '{{.Endpoints.docker.Host}}']).decode().strip()
    if not local_desktop_endpoint(endpoint):
        raise StackError('existing_local_desktop_endpoint_required')
    require_idle_host(args.state)
    fd = os.open(args.state / 'local-stack.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
            raise StackError('private_stack_lock_required')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise StackError('stack_recovery_in_progress') from None
        require_idle_host(args.state)
        config = load_config(args.state / 'dev-runtime.json')
        checkout = Path(config['mobile']).parent
        if run(['git', '-C', str(checkout), 'branch', '--show-current']).decode().strip() != 'ety/local-dev-foundation':
            raise StackError('configured_foundation_branch_required')
        # Docker's supported CLI starts the existing app only; no new daemon,
        # context switch, compose change, container replacement or credential work.
        run(['docker', 'desktop', 'start', '--timeout', '30'], timeout=35)
        mounts = json.loads(run(['docker', 'inspect', '--format', '{{json .Mounts}}', args.backend_container]))
        if not checked_mount(mounts, checkout):
            raise StackError('configured_checkout_mount_required')
        # An owner may have arrived while Docker was starting. Preserve them.
        require_idle_host(args.state)
        print(json.dumps(ensure_backend(args.backend_container, args.timeout,
                                        before_launch=lambda: require_idle_host(args.state))))
    finally:
        os.close(fd)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'backendReady': False, 'failure': str(error) if isinstance(error, StackError) else 'guarded_stack_recovery_failed',
                          'outcome': 'inspect_current_state_before_retry', 'dataReset': False, 'workersStopped': False}))
        raise SystemExit(2)
