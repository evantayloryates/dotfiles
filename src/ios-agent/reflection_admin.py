"""Plan/adopt an existing exact approved reflection node; never enroll or route-expand."""
import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

from service import STATE
from local_stack import require_idle_host, local_desktop_endpoint

ROOT = Path(__file__).resolve().parent


def docker(*args):
    result = subprocess.run(['docker', *args], capture_output=True, timeout=12)
    if result.returncode:
        raise ValueError('local_relay_command_failed')
    return result.stdout


def private_json(path):
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077
            or info.st_uid != os.getuid() or info.st_size > 4096):
        raise ValueError('private_relay_configuration_required')
    return json.loads(path.read_text())


def validate_container(config, container, probes, state):
    if (set(config) != {'version', 'scope', 'containerId', 'image'}
            or config['version'] != 1 or config['scope'] not in ('qualification', 'personal-dev')
            or not re.fullmatch('[a-f0-9]{64}', config['containerId'])
            or not re.fullmatch('sha256:[a-f0-9]{64}', config['image'])):
        raise ValueError('fixed_reflection_configuration_required')
    host = container.get('HostConfig', {})
    mounts = container.get('Mounts', [])
    if (container.get('Id') != config['containerId'] or container.get('Image') != config['image']
            or container.get('State', {}).get('Running') is not True
            or host.get('Privileged') is not False or host.get('NetworkMode') != 'bridge'
            or set(host.get('CapAdd') or []) != {'CAP_NET_ADMIN'}
            or host.get('Devices') != [{'PathOnHost': '/dev/net/tun', 'PathInContainer': '/dev/net/tun', 'CgroupPermissions': 'rwm'}]
            or host.get('PortBindings') not in (None, {})
            or container.get('Config', {}).get('Entrypoint') != ['/usr/local/bin/tailscaled']
            or container.get('Config', {}).get('Cmd') != ['--state=/var/lib/tailscale/tailscaled.state', '--socket=/var/run/tailscale/tailscaled.sock', '--tun=tailscale0']
            or any(v.startswith('TS_') for v in container.get('Config', {}).get('Env', []))
            or not any(m.get('Destination') == '/probe' and m.get('RW') is False
                       and Path(m.get('Source', '')).resolve() == probes.resolve() for m in mounts)
            or not any(m.get('Destination') == '/var/lib/tailscale' and m.get('RW') is True
                       and Path(m.get('Source', '')).resolve() == (state / 'packet-relay-state').resolve() for m in mounts)
            or len(mounts) != 2):
        raise ValueError('exact_local_relay_container_required')


def validate(config, container, status, prefs, probes, state):
    validate_container(config, container, probes, state)
    user = status.get('User', {}).get(str(status.get('Self', {}).get('UserID')), {})
    node = status.get('Self', {}).get('ID')
    if (status.get('BackendState') != 'Running' or user.get('LoginName') != 'evantayloryates@gmail.com'
            or not isinstance(node, str) or not re.fullmatch('[A-Za-z0-9_-]{8,64}', node)):
        raise ValueError('existing_personal_relay_node_required')
    if (prefs.get('AdvertiseRoutes') != ['10.7.0.1/32'] or prefs.get('NoSNAT') is not True
            or prefs.get('CorpDNS') is not False or prefs.get('RouteAll') is not False
            or prefs.get('RunSSH') is not False or prefs.get('ExitNodeID')
            or prefs.get('ExitNodeIP') not in (None, '', 'invalid IP')
            or prefs.get('AdvertiseTags')):
        raise ValueError('existing_exact_relay_route_required')
    return {'ok': True, 'scope': config['scope'], 'nodeId': node,
            'containerId': config['containerId'], 'image': config['image'],
            'restartPolicy': container['HostConfig'].get('RestartPolicy', {}).get('Name'),
            'route': '10.7.0.1/32', 'personalAccountVerified': True,
            'newEnrollment': False, 'routeExpansion': False,
            'promotionRequired': config['scope'] != 'personal-dev',
            'networkSettingsChanged': False}


def observe(state):
    if os.environ.get('DOCKER_HOST') or os.environ.get('DOCKER_CONTEXT', 'desktop-linux') != 'desktop-linux':
        raise ValueError('local_desktop_context_required')
    if docker('context', 'show').decode().strip() != 'desktop-linux':
        raise ValueError('local_desktop_context_required')
    endpoint = docker('context', 'inspect', 'desktop-linux', '--format', '{{.Endpoints.docker.Host}}').decode().strip()
    if not local_desktop_endpoint(endpoint):
        raise ValueError('local_desktop_endpoint_required')
    config = private_json(state / 'developer-reflection.json')
    # Validate pins before passing them to Docker. No caller-supplied container name.
    if not re.fullmatch('[a-f0-9]{64}', str(config.get('containerId', ''))):
        raise ValueError('exact_local_relay_container_required')
    containers = json.loads(docker('inspect', config['containerId']))
    if not isinstance(containers, list) or len(containers) != 1:
        raise ValueError('exact_local_relay_container_required')
    validate_container(config, containers[0], ROOT / 'probes', state)
    status = json.loads(docker('exec', config['containerId'], 'tailscale', 'status', '--json'))
    prefs = json.loads(docker('exec', config['containerId'], 'tailscale', 'debug', 'prefs'))
    serve = json.loads(docker('exec', config['containerId'], 'tailscale', 'serve', 'status', '--json'))
    if serve != {}:
        raise ValueError('relay_serve_and_funnel_must_remain_off')
    return config, validate(config, containers[0], status, prefs, ROOT / 'probes', state)


def adopt(state, expected_node):
    require_idle_host(state)
    config, before = observe(state)
    if expected_node != before['nodeId']:
        raise ValueError('matching_reviewed_node_required')
    require_idle_host(state)
    # Metadata only: never restart, replace, rename, log in or alter the node/routes.
    # If Docker times out, inspect plan; do not replay the uncertain update.
    docker('update', '--restart=unless-stopped', config['containerId'])
    config['scope'] = 'personal-dev'
    fd, temporary = tempfile.mkstemp(prefix='reflection-', suffix='.json', dir=state)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(config, stream)
            stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, state / 'developer-reflection.json')
    finally:
        Path(temporary).unlink(missing_ok=True)
    _, after = observe(state)
    if after['nodeId'] != expected_node or after['restartPolicy'] != 'unless-stopped':
        raise ValueError('relay_promotion_readback_unconfirmed')
    return {**after, 'promotionVerified': True, 'networkSettingsChanged': False,
            'note': 'Existing node only. Nearby MCP is qualified; cellular Inspector remains unqualified.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['plan', 'adopt'])
    parser.add_argument('--allow-persistent-node', action='store_true')
    parser.add_argument('--expected-node')
    args = parser.parse_args()
    try:
        if args.action == 'adopt':
            if not args.allow_persistent_node or not args.expected_node:
                raise ValueError('explicit_persistent_node_authorization_required')
            value = adopt(STATE, args.expected_node)
        else:
            _, value = observe(STATE)
        print(json.dumps(value))
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        reason = str(error) if type(error) is ValueError and re.fullmatch('[a-z_]+', str(error)) else 'relay_operation_unconfirmed'
        print(json.dumps({'ok': False, 'reason': reason, 'replay': False,
                          'next': 'Read plan/current state before any retry. No account, route or credential changes are performed.'}))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
