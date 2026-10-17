"""Allowlisted task identity and bounded, read-only Docker process snapshots."""
import datetime as dt
import os
import re
import shlex

POLICY = 'guest-task-delta-v3'
TOOLS = {'yarn', 'npm', 'npx', 'pnpm', 'eslint', 'tsc', 'tsserver', 'jest', 'vitest',
         'mocha', 'tsx', 'ts-node', 'next', 'webpack', 'vite', 'turbo', 'prettier',
         'lint-staged', 'husky', 'node-gyp', 'rollup', 'esbuild', 'babel', 'metro', 'nx'}
EXECUTABLES = TOOLS | {'node', 'nodejs', 'python', 'python3', 'java', 'bun', 'deno',
                      'sh', 'bash', 'zsh', 'git', 'postgres', 'mysqld', 'redis-server',
                      'nginx', 'tini', 'sleep', 'ps'}
TASK = re.compile(r'^(?:test|lint|typecheck|check|build|dev|start|format|precommit|pre-commit|'
                  r'postinstall|install|prepare|validate|verify|compile)(?::[a-z0-9_-]{1,40}){0,3}$')
FLAGS = {'--noEmit', '--watch', '--check', '--runInBand', '--coverage', '--fix', '--no-cache'}


def framework_entrypoint(value):
    """Recognize fixed package entrypoints, never arbitrary script basenames."""
    path = value.replace('\\', '/')
    signatures = {
        '/node_modules/next/dist/compiled/jest-worker/processChild.js':
            dict(tool='next', role='process-worker', worker_kind='jest-worker'),
        '/node_modules/next/dist/server/lib/start-server.js': dict(tool='next', role='server-start'),
        '/node_modules/jest-worker/build/workers/processChild.js':
            dict(tool='jest-worker', role='process-worker', worker_kind='jest-worker'),
        '/node_modules/jest-worker/build/workers/threadChild.js':
            dict(tool='jest-worker', role='thread-worker', worker_kind='jest-worker'),
        '/node_modules/piscina/dist/worker.js': dict(tool='piscina', role='thread-worker'),
        '/node_modules/vitest/dist/worker.js': dict(tool='vitest', role='test-worker'),
    }
    return next((dict(identity) for suffix, identity in signatures.items()
                 if path.endswith(suffix)), None)


def tool_name(value):
    base = os.path.basename(value)
    aliases = {'yarn.js':'yarn', 'yarn.cjs':'yarn', 'npm-cli.js':'npm', 'npx-cli.js':'npx'}
    if base in aliases:
        return aliases[base]
    if re.fullmatch(r'yarn-\d[\d.]*\.cjs', base):
        return 'yarn'
    stem = re.sub(r'\.(?:mjs|cjs|js)$', '', base)
    return stem if stem in TOOLS else None


def identify(argv):
    """Read only structural argv positions; never retain raw arguments or paths."""
    if not argv:
        return None
    base = os.path.basename(argv[0]); args = argv[1:]
    tool = tool_name(argv[0])
    if base in ('node', 'nodejs'):
        while args and args[0].startswith('-'):
            flag = args[0]
            if flag in ('-e', '--eval', '-p', '--print') or flag.startswith(('--eval=', '--print=')):
                return dict(tool='node', mode='inline')
            if flag in ('-r', '--require', '--loader', '--import', '--conditions', '--title'):
                args = args[2:]
            elif '=' in flag or flag in ('--no-warnings', '--enable-source-maps',
                                         '--experimental-vm-modules', '--trace-warnings', '--preserve-symlinks'):
                args = args[1:]
            else:
                return dict(tool='node', mode='unresolved')
        if not args:
            return dict(tool='node', mode='unresolved')
        entrypoint = args[0]
        framework = framework_entrypoint(entrypoint)
        if framework:
            return framework
        tool = tool_name(entrypoint); args = args[1:]
        if not tool:
            return dict(tool='node', mode='unrecognized_entrypoint')
    if not tool:
        return None
    out = dict(tool=tool)
    if tool in ('yarn', 'npm', 'pnpm'):
        # Workspace/package names, prefix paths, forwarded arguments and values
        # are excluded. Only a recognized task in its command position survives.
        if args[:1] == ['run']:
            args = args[1:]
        elif args[:1] == ['workspace']:
            args = args[2:]
            if args[:1] == ['run']:
                args = args[1:]
        if args and TASK.fullmatch(args[0]):
            out['task'] = args[0]
    safe_flags = [a for a in args if a in FLAGS][:4]
    if safe_flags:
        out['flags'] = safe_flags
    return out


def guest_identity(command, argv):
    # Next rewrites its process title, removing the original Node entrypoint.
    # Require the entire supported title; do not search arbitrary arguments.
    if re.fullmatch(r'next-server(?: \(v\d+(?:\.\d+){1,3}(?:-[a-z0-9.-]{1,40})?\))?', command):
        return dict(tool='next', role='server'), 'process-title'
    identity = identify(argv)
    return identity, 'structural-argv' if identity else None


def task_context(proc, by_pid):
    """Bounded same-snapshot ancestry; parent task is context, not worker identity."""
    current = proc; seen = {proc['pid']}; nearest = None
    for distance in range(1, 5):
        parent = by_pid.get(current['ppid'])
        if not parent or parent['pid'] in seen or parent['elapsed_seconds'] < current['elapsed_seconds']:
            break
        seen.add(parent['pid'])
        identity = parent.get('task_identity')
        if identity and 'mode' not in identity:
            candidate = dict(ancestor_pid=parent['pid'], ancestor_ppid=parent['ppid'],
                             ancestor_elapsed_seconds=parent['elapsed_seconds'], distance=distance,
                             identity=identity, evidence='same-snapshot-ancestry')
            if identity.get('task'):
                return candidate
            if nearest is None:
                nearest = candidate
        current = parent
    return nearest


def cpu_time_seconds(value):
    days = 0
    if '-' in value:
        day, value = value.split('-',1)
        if not day.isdigit():
            raise ValueError('invalid CPU days')
        days = int(day)
    parts = value.split(':')
    if len(parts) not in (2, 3) or not all(part.isdigit() for part in parts):
        raise ValueError('invalid CPU time')
    return days*86400 + sum(int(part)*60**power for power,part in enumerate(reversed(parts)))


def parse_top(output):
    rows = []; malformed = 0
    lines = output.splitlines()
    if not lines or not re.match(r'^PID\s+PPID\s+RSS\s+%CPU\s+TIME\s+ELAPSED\s+COMMAND$', lines[0]):
        raise ValueError('unsupported process header')
    for line in lines[1:2049]:
        try:
            if len(line)>16384:
                raise ValueError('long row')
            pid, ppid, rss, cpu, cpu_time, elapsed, command = line.split(None, 6)
            pid, ppid, rss, elapsed = map(int, (pid,ppid,rss,elapsed)); cpu = float(cpu)
            cpu_seconds = cpu_time_seconds(cpu_time)
            if min(pid,ppid,rss,elapsed)<0 or not 0<=cpu<=100000:
                raise ValueError('invalid counters')
            argv = shlex.split(command)
            if not argv:
                raise ValueError('missing executable')
            base = os.path.basename(argv[0])
            identity, evidence = guest_identity(command, argv)
            rows.append(dict(pid=pid,ppid=ppid,rss_bytes=rss*1024,cpu_lifetime_percent=cpu,
                             cpu_time_seconds=cpu_seconds,
                             elapsed_seconds=elapsed,exe=base if base in EXECUTABLES else 'other',
                             task_identity=identity, identity_evidence=evidence))
        except (ValueError,TypeError):
            malformed += 1
    # Preserve leading CPU/RSS workers and bounded parents. No argv survives.
    chosen = {}
    for metric in ('cpu_lifetime_percent','rss_bytes'):
        for p in sorted(rows,key=lambda x:x[metric],reverse=True)[:8]:
            chosen[p['pid']] = p
    by_pid = {p['pid']:p for p in rows}
    # Resolve from the already bounded census before pruning. A named launcher
    # may not itself rank high enough for the 24 retained process rows.
    for p in chosen.values():
        p['task_context'] = task_context(p, by_pid)
    for p in list(chosen.values()):
        for _ in range(4):
            parent = by_pid.get(p['ppid'])
            if not parent or parent['pid'] in chosen or len(chosen)>=24:
                break
            chosen[parent['pid']] = parent; p = parent
    for p in chosen.values():
        if 'task_context' not in p:
            p['task_context'] = task_context(p, by_pid)
    return dict(process_count=len(rows),rows_considered=min(len(lines)-1,2048),
                row_limit_hit=len(lines)>2049,malformed_rows=malformed,
                processes=list(chosen.values())[:24],
                identity_covered=sum(bool(p.get('task_identity')) and 'mode' not in p['task_identity'] for p in chosen.values()),
                task_context_covered=sum(bool(p.get('task_context')) for p in chosen.values()),
                named_task_context_covered=sum(bool((p.get('task_context') or {}).get('identity',{}).get('task')) for p in chosen.values()),
                limits='CPU is a lifetime average until paired with a later snapshot; CPU time has one-second resolution. RSS is a point snapshot. Guest PIDs/elapsed time are not host PID/start identities or swap ownership. Parent task context is provenance, not proof of the worker task. Unknown identities stay unknown. Arguments, environment and paths are not retained.')


def guest_rankings(docker, containers, run, now):
    def score(c):
        try:
            cpu=float(c.get('CPUPerc','0').rstrip('%'))/100
            m=re.match(r'([\d.]+)([KMGT]?i?B)',c.get('MemUsage',''))
            units={'B':1,'kB':1000,'KB':1000,'MB':1000**2,'GB':1000**3,'TB':1000**4,
                   'KiB':1024,'MiB':1024**2,'GiB':1024**3,'TiB':1024**4}
            memory=float(m[1])*units[m[2]]/(2*1024**3) if m else 0
            return max(cpu,memory)
        except (ValueError,KeyError):
            return 0
    selected=sorted([c for c in containers if re.fullmatch(r'[a-f0-9]{12,64}',c.get('ID',''))],
                    key=score,reverse=True)[:2]
    results=[]
    for c in selected:
        # Docker top asks the daemon for a process listing; no docker exec,
        # workload process creation, container pause, or guest filesystem reads.
        r=run([docker,'top',c['ID'],'-eo','pid,ppid,rss,pcpu,time,etimes,args'],timeout=2,limit=256*1024)
        item=dict(container_id=c['ID'],timestamp=now(),**{k:r[k] for k in
                  ('status','duration_ms','truncated') if k in r})
        if r.get('truncated'):
            item['status']='truncated'
        if r['status']=='ok' and not r.get('truncated'):
            try:
                item.update(parse_top(r.get('output','')))
            except ValueError:
                item['status']='unsupported_process_format'
        results.append(item)
    return dict(policy=POLICY,containers=results,container_limit=2,timeout_per_container_seconds=2,
                output_limit_per_container_bytes=256*1024,process_limit_per_container=24,
                status='ok' if all(c['status']=='ok' for c in results) else 'partial',
                limits='At most two containers per window; no retries. Snapshot ranking is observational, not causal proof.')


def guest_deltas(first, second, elapsed_seconds):
    """Pair only retained same-lifetime guest rows; never infer missing work."""
    out = []
    valid_intervals = 0
    old_containers = {c['container_id']: c for c in first.get('containers', []) if c.get('status') == 'ok'}
    for container in second.get('containers', []):
        prior = old_containers.get(container['container_id'])
        if not prior or container.get('status') != 'ok':
            continue
        interval = elapsed_seconds
        try:
            interval = (dt.datetime.fromisoformat(container['timestamp'].replace('Z','+00:00')) -
                        dt.datetime.fromisoformat(prior['timestamp'].replace('Z','+00:00'))).total_seconds()
        except (KeyError,ValueError,TypeError):
            pass
        if interval <= 0:
            continue
        valid_intervals += 1
        old = {p['pid']:p for p in prior.get('processes', [])}
        for p in container.get('processes', []):
            q = old.get(p['pid'])
            if not q or abs((p['elapsed_seconds']-q['elapsed_seconds'])-interval)>2:
                continue
            delta = p['cpu_time_seconds']-q['cpu_time_seconds']
            if delta < 0:
                continue
            out.append(dict(container_id=container['container_id'], pid=p['pid'],
                            cpu_seconds_delta=delta, cpu_percent_interval=100*delta/interval,
                            interval_seconds=interval,
                            rss_bytes=p['rss_bytes'], rss_delta_bytes=p['rss_bytes']-q['rss_bytes'],
                            task_identity=p.get('task_identity'), task_context=p.get('task_context')))
    out.sort(key=lambda x:x['cpu_seconds_delta'], reverse=True)
    return dict(status='ok' if valid_intervals else 'invalid_interval',elapsed_seconds=elapsed_seconds,processes=out[:24],
                matched_process_count=len(out),
                limits='Only retained same-container PID and elapsed-age matches. CPU time has one-second resolution; short jobs and unretained rows are missed. RSS is not additive with host Docker VM footprint. No guest disk or swap ownership is inferred.')
