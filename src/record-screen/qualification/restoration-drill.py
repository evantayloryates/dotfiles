#!/usr/bin/env python3
"""Private signed-bundle fallback/forward drill; never installs or captures.

Copies one explicitly named terminal session and its actions. Relocates copied
path strings, preserving originals, and independently probes cloned history.
The partial checkpoint is authored from a completed manifest, not a real crash.
"""
import argparse
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tempfile
import time

spec = importlib.util.spec_from_file_location('readiness', Path(__file__).with_name('delivery-readiness.py'))
readiness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(readiness)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hashes(root):
    return {str(p.relative_to(root)): digest(p) for p in root.rglob('*') if p.is_file()}


def save(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')


def relocate(value, source, target):
    if isinstance(value, str):
        return str(target) + value[len(str(source)):] if value.startswith(str(source) + '/') else value
    if isinstance(value, list):
        return [relocate(v, source, target) for v in value]
    if isinstance(value, dict):
        return {k: relocate(v, source, target) for k, v in value.items()}
    return value


@contextmanager
def retained_runtime(out):
    with tempfile.TemporaryDirectory(prefix='rs-restore-') as tmp:
        try:
            yield tmp
        except BaseException as error:
            shutil.copytree(tmp, out / 'failed-private-runtime', ignore=shutil.ignore_patterns('engine.sock'))
            save(out / 'failure.json', {'error_type': type(error).__name__, 'error': str(error),
                                      'private_root': tmp, 'production_mutation': False})
            raise


def run(args):
    assert re.fullmatch(r'ses_[a-z0-9]+', args.session_id), 'Session ID must be a single recorder identifier'
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    source = args.state_root.resolve()
    original = source / 'sessions' / args.session_id
    assert original.is_dir(), 'Explicit source session does not exist'
    assert not any(p.is_symlink() for p in original.rglob('*')), 'Session symlinks are not copied'
    manifests = list(original.glob('recordings/*/recording.json'))
    assert manifests, 'No saved recordings'
    for p in manifests:
        assert json.loads(p.read_text())['state'] in ['done', 'failed', 'cancelled', 'interrupted', 'skipped'], 'Never clone scheduled or live work into a running engine'
    original_hashes = hashes(original)
    actions = [p for p in (source / 'actions').glob('act_*.json')
               if json.loads(p.read_text()).get('session_id') == args.session_id]
    assert all(json.loads(p.read_text())['state'] != 'active' for p in actions), 'Only completed action receipts are copied'
    action_hashes = {p.name: digest(p) for p in actions}
    bundles = [('current', args.current.resolve()), ('fallback', args.previous.resolve()), ('forward', args.current.resolve())]
    identities = [readiness.signature(p) for _, p in bundles]
    assert all(i['Identifier'] == 'com.taylor.record-screen' and i['TeamIdentifier'] == identities[0]['TeamIdentifier']
               and i['TeamIdentifier'] != 'not set' for i in identities)
    # A short private root is necessary for macOS Unix socket path limits.
    with retained_runtime(out) as tmp:
        home = Path(tmp) / 'state'
        clone = home / 'sessions' / args.session_id
        clone.parent.mkdir(parents=True)
        shutil.copytree(original, clone)
        (home / 'actions').mkdir()
        for p in actions:
            shutil.copy2(p, home / 'actions' / p.name)
        for p in home.rglob('*.json'):
            save(p, relocate(json.loads(p.read_text()), source, home))
        baseline = hashes(clone)
        checkpoint = json.loads(manifests[-1].read_text())
        checkpoint_id = 'rec_restore_checkpoint'
        checkpoint_dir = clone / 'recordings' / checkpoint_id
        shutil.copytree(clone / 'recordings' / checkpoint['recording_id'], checkpoint_dir)
        checkpoint = relocate(checkpoint, source, home)
        checkpoint.update(recording_id=checkpoint_id, dir=str(checkpoint_dir), state='recording',
                          label='Authored saved checkpoint; not a real interrupted take')
        checkpoint['source_packet']['path'] = str(checkpoint_dir / 'source.jsonl')
        save(checkpoint_dir / 'recording.json', checkpoint)
        private_actions_before = hashes(home / 'actions')
        save(out / 'baseline.json', {'original_session': original_hashes, 'original_actions': action_hashes,
                                     'relocated_clone': baseline, 'identity': identities[0],
                                     'path_relocation': {'from': str(source), 'to': str(home)},
                                     'checkpoint': 'authored state=recording from a completed take'})
        results = []
        for name, bundle in bundles:
            installed = Path(tmp) / 'record-screend.app'
            if installed.exists():
                installed.rename(out / ('retained-' + results[-1]['phase'] + '.app'))
            shutil.copytree(bundle, installed)
            assert digest(installed / 'Contents/MacOS/record-screend') == digest(bundle / 'Contents/MacOS/record-screend')
            readiness.signature(installed)
            expected = plistlib.loads((installed / 'Contents/Info.plist').read_bytes())['RSBuildHash']
            with (out / (name + '-process.log')).open('w') as log:
                process = subprocess.Popen([str(installed / 'Contents/MacOS/record-screend')],
                                           env={**os.environ, 'RECORD_SCREEN_HOME': str(home)}, stdout=log, stderr=log)
                try:
                    deadline = time.monotonic() + 8
                    while True:
                        assert process.poll() is None, 'Owned engine exited before readiness'
                        try:
                            status = readiness.call(home / 'run/engine.sock', 'status')
                            if status.get('maintenance', {}).get('loading') is False:
                                break
                        except (OSError, RuntimeError):
                            pass
                        assert time.monotonic() < deadline, 'Private load deadline; never restart an uncertain launch'
                        time.sleep(.05)
                    assert status['engine']['pid'] == process.pid and status['engine']['build'] == expected
                    assert status['paths']['root'] == str(home)
                    assert status['input_timeline']['subscribers'] == 0
                    assert status['viewfinder']['lanes'] == []
                    assert readiness.call(home / 'run/engine.sock', 'record.list', {'active': True})['total'] == 0
                    session = readiness.call(home / 'run/engine.sock', 'session.get', {'session_id': args.session_id})
                    assert session['session_id'] == args.session_id
                    records = []
                    for p in manifests:
                        before = relocate(json.loads(p.read_text()), source, home)
                        reply = readiness.call(home / 'run/engine.sock', 'record.source', {'recording_id': before['recording_id']})
                        assert reply['state'] == before['state'] and reply['frames'] == before['frames']
                        assert reply['source_packet'] == before['source_packet'], 'Unknown source fields must survive fallback'
                        assert Path(reply['source_packet']['path']).is_relative_to(home)
                        assert Path(reply['video']['path']).is_relative_to(home)
                        records.append(reply)
                    partial = readiness.call(home / 'run/engine.sock', 'record.get', {'recording_id': checkpoint_id})
                    assert partial['state'] == 'interrupted'
                    assert partial['frames_provenance'] == 'persisted_checkpoint_not_final'
                    assert partial['source_packet']['complete'] is False
                    assert partial['source_packet']['counts_provenance'] == 'persisted_checkpoint_not_final'
                    recovered = readiness.call(home / 'run/engine.sock', 'action.list', {'session_id': args.session_id})
                    actual = {r['action_token']: (r['state'], r['result']) for r in recovered['actions']}
                    assert actual == {json.loads(p.read_text())['action_token']: (json.loads(p.read_text())['state'], json.loads(p.read_text())['result']) for p in actions}
                    result = {'phase': name, 'build': expected, 'pid': process.pid, 'original_records': records,
                              'checkpoint': partial, 'actions': recovered, 'status': status}
                    save(out / (name + '-readback.json'), result)
                finally:
                    if process.poll() is None:
                        process.terminate()
                    process.wait(timeout=5)
                assert process.returncode == 0, 'Owned shutdown must settle'
            assert all(digest(clone / path) == value for path, value in baseline.items()), 'Fallback/forward must preserve copied originals'
            assert hashes(home / 'actions') == private_actions_before
            assert hashes(original) == original_hashes
            assert all(digest(p) == action_hashes[p.name] for p in actions)
            results.append({'phase': name, 'build': expected, 'pid': process.pid, 'reaped': True,
                            'originals_and_cloned_terminal_state_unchanged': True})
        retained = out / 'retained-private-state'
        shutil.copytree(home, retained, ignore=shutil.ignore_patterns('engine.sock'))
        # Runtime replies preserve their observed short paths. Retained JSON
        # manifests point to the durable copy so a later private drill can seed it.
        for p in retained.rglob('*.json'):
            save(p, relocate(json.loads(p.read_text()), home, retained))
        save(out / 'retained-copy.json', {'runtime_root': str(home), 'retained_root': str(retained),
                                        'path_relocation_only': True, 'hashes': hashes(retained)})
        installed.rename(out / 'retained-forward.app')
    proof = {'schema': 'private-restoration-drill/v1', 'passed': True, 'phases': results,
             'session_files_preserved': len(original_hashes), 'action_files_preserved': len(actions),
             'limits': ['Private bundle/state drill; no production replacement or launchd rollback',
                        'One explicitly named terminal session; no live producer recovery',
                        'Partial checkpoint is authored; complete source-file rows do not promote its manifest coverage',
                        'No capture, input listener, grant request, export, UI action or automatic mutation replay']}
    save(out / 'restoration-proof.json', proof)
    print(json.dumps(proof))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--current', type=Path, required=True)
    parser.add_argument('--previous', type=Path, required=True)
    parser.add_argument('--state-root', type=Path, required=True)
    parser.add_argument('--session-id', required=True)
    parser.add_argument('--output', type=Path, required=True)
    run(parser.parse_args())
