#!/usr/bin/env python3
"""Read-only host prerequisite checks. Never acquires, launches or repairs."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
from cli import request
from install import tailscale
from install_runtime import probe, serve_compatible, verify_local_backend
from dev_runtime import load_config
from service import STATE


def check_host(state=STATE, backend_container='default-ki-e3ee9-dev-1'):
    checks = {}
    def check(name, operation):
        try:
            value = operation()
            checks[name] = value is True
        except Exception:
            # Provider and process errors can contain credentials. Fixed names
            # and booleans are the entire diagnostic boundary.
            checks[name] = False

    status = None
    try:
        status = request({'op': 'status'}, state, timeout=2)
    except Exception:
        pass
    checks['hostWorkerResponding'] = isinstance(status, dict)
    checks['hostWorkerSourceVerified'] = bool(status and status.get('sourceHash') ==
        hashlib.sha256((Path(__file__).parent / 'service.py').read_bytes()).hexdigest())
    config = None
    try:
        config = load_config(state / 'dev-runtime.json')
    except Exception:
        pass
    checks['privateRuntimeConfigValid'] = config is not None
    check('personalTailnetRunning', lambda: personal_tailnet(tailscale('status', '--json')))
    check('privateServeRoutesVerified', lambda: routes_valid(config, tailscale('serve', 'status', '--json')))
    check('guardedLocalBackendProcess', lambda: backend_valid(backend_container))
    check('localGraphQLReady', lambda: probe('http://127.0.0.1:4000/development/graphql', graphql=True))
    check('localWebReady', lambda: probe('http://127.0.0.1:3000/sign-in'))
    check('localMetroHTTPReady', metro_ready)
    return {'version': 1, 'checks': checks,
            'hostPrerequisitesReady': all(checks.values()),
            'deviceRegistered': bool(status and status.get('device')),
            'ownerActive': bool(status and status.get('lease')),
            'hostIdle': bool(status and status.get('lease') is None and
                status.get('reactFrontendRunning') is False and
                status.get('reactFrontendCleanupPending') is False),
            'applicationReadiness': 'requires_fresh_owned_lease_and_verify_ready',
            'repairsPerformed': False}


def personal_tailnet(status):
    user = status.get('User', {}).get(str(status.get('Self', {}).get('UserID')), {})
    return status.get('BackendState') == 'Running' and user.get('LoginName') == 'evantayloryates@gmail.com'


def routes_valid(config, status):
    if config is None:
        return False
    targets = serve_compatible(config, status)
    targets[10443] = 19403
    host = config['metroURL'].split('/')[2].split(':')[0]
    return all(status.get('TCP', {}).get(str(port)) == {'HTTPS': True} and
               status.get('Web', {}).get(f'{host}:{port}', {}).get('Handlers') ==
               {'/': {'Proxy': f'http://127.0.0.1:{target}'}} for port, target in targets.items())


def metro_ready():
    with urllib.request.urlopen('http://127.0.0.1:19404/status', timeout=5) as response:
        return response.status == 200 and response.read(128) == b'packager-status:running'


def backend_valid(container):
    verify_local_backend(container)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, default=STATE)
    parser.add_argument('--backend-container', default='default-ki-e3ee9-dev-1')
    args = parser.parse_args()
    value = check_host(args.state, args.backend_container)
    print(json.dumps(value))
    return 0 if value['hostPrerequisitesReady'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
