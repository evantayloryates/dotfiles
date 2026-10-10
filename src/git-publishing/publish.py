#!/usr/bin/env python3
"""Publish shared dotfiles master without overwriting an unseen remote update."""
import argparse
import fcntl
from pathlib import Path
import subprocess
import sys
import time
import uuid


def git(repo, *args, capture=False, check=True):
    return subprocess.run(['git', '-C', str(repo), *args], check=check,
                          text=True, stdout=subprocess.PIPE if capture else None)


def value(repo, *args):
    return git(repo, *args, capture=True).stdout.strip()


def publish(repo, *, check_only=False, attempts=3):
    common = Path(value(repo, 'rev-parse', '--git-common-dir'))
    if not common.is_absolute():
        common = repo / common
    with (common / 'dotfiles-publish.lock').open('a') as lock:
        deadline = time.monotonic() + 60
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Another publisher is still active; retry after it finishes.')
                time.sleep(0.5)
        if value(repo, 'branch', '--show-current') != 'master':
            raise RuntimeError('Publish from master; this command never switches branches.')
        for marker in ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD']:
            paused = Path(value(repo, 'rev-parse', '--git-path', marker))
            if not paused.is_absolute():
                paused = repo / paused
            if paused.exists():
                raise RuntimeError('Finish the in-progress Git operation before publishing.')
        if value(repo, 'status', '--porcelain'):
            raise RuntimeError('Commit shared changes first; publisher does not stash another client’s edits.')
        if check_only:
            print('master is clean; no paused Git operation. No fetch/rebase/push performed.')
            return
        for attempt in range(attempts):
            # A unique ref avoids BOTH origin/master and FETCH_HEAD races
            # from background fetchers. Delete only our exact temporary ref.
            fetched_ref = 'refs/dotfiles-publish/' + uuid.uuid4().hex
            try:
                git(repo, 'fetch', '--no-tags', '--no-write-fetch-head', 'origin',
                    'refs/heads/master:' + fetched_ref)
                expected = value(repo, 'rev-parse', fetched_ref)
            finally:
                git(repo, 'update-ref', '-d', fetched_ref, check=False)
            git(repo, 'rebase', '--no-autostash', expected)
            if value(repo, 'status', '--porcelain'):
                raise RuntimeError('Shared edits appeared during rebase; commit them before publishing.')
            head = value(repo, 'rev-parse', 'HEAD')
            git(repo, 'merge-base', '--is-ancestor', expected, head)
            result = git(repo, 'push', f'--force-with-lease=refs/heads/master:{expected}',
                         'origin', f'{head}:refs/heads/master', check=False)
            if result.returncode == 0:
                print(f'Published master {head[:12]} with explicit lease {expected[:12]}.')
                return
            # Retry only when a read proves a competing remote update. Auth,
            # policy, secret-scanner and server-hook failures stay actionable.
            remote = value(repo, 'ls-remote', 'origin', 'refs/heads/master')
            actual = remote.split()[0] if remote else None
            if actual == head:
                print(f'Remote master already matches {head[:12]}; publication verified.')
                return
            if actual == expected or not actual:
                raise RuntimeError('Push rejected without a competing master update; inspect the stated Git error.')
            if attempt + 1 < attempts:
                print('Another client updated master; fetching and rebasing again.', flush=True)
        raise RuntimeError('Master moved during all three attempts; retry after competing publishers settle.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Read-only local readiness; no network or publication')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    allowed = ['https://github.com/evantayloryates/dotfiles.git',
               'git@github.com:evantayloryates/dotfiles.git']
    if value(repo, 'remote', 'get-url', '--push', 'origin') not in allowed:
        raise RuntimeError('Expected Taylor’s dotfiles origin; configure it before publishing.')
    publish(repo, check_only=args.check)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f'dotfiles-publish: {error}', file=sys.stderr)
        sys.exit(1)
