"""Allowlisted task identity and bounded, read-only Docker process snapshots."""
import os
import re
import shlex

POLICY = 'early-task-guest-v1'
TOOLS = {'yarn', 'npm', 'npx', 'pnpm', 'eslint', 'tsc', 'tsserver', 'jest', 'vitest',
         'mocha', 'tsx', 'ts-node', 'next', 'webpack', 'vite', 'turbo', 'prettier',
         'lint-staged', 'husky', 'node-gyp', 'rollup', 'esbuild', 'babel', 'metro', 'nx'}
EXECUTABLES = TOOLS | {'node', 'nodejs', 'python', 'python3', 'java', 'bun', 'deno',
                      'sh', 'bash', 'zsh', 'git', 'postgres', 'mysqld', 'redis-server',
                      'nginx', 'tini', 'sleep', 'ps'}
TASK = re.compile(r'^(?:test|lint|typecheck|check|build|dev|start|format|precommit|pre-commit|'
                  r'postinstall|install|prepare|validate|verify|compile)(?::[a-z0-9_-]{1,40}){0,3}$')
FLAGS = {'--noEmit', '--watch', '--check', '--runInBand', '--coverage', '--fix', '--no-cache'}


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
        tool = tool_name(args[0]); args = args[1:]
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


def parse_top(output):
    rows = []; malformed = 0
    lines = output.splitlines()
    if not lines or not re.match(r'^PID\s+PPID\s+RSS\s+', lines[0]):
        raise ValueError('unsupported process header')
    for line in lines[1:2049]:
        try:
            if len(line)>16384:
                raise ValueError('long row')
            pid, ppid, rss, cpu, elapsed, command = line.split(None, 5)
            pid, ppid, rss, elapsed = map(int, (pid,ppid,rss,elapsed)); cpu = float(cpu)
            if min(pid,ppid,rss,elapsed)<0 or not 0<=cpu<=100000:
                raise ValueError('invalid counters')
            argv = shlex.split(command)
            if not argv:
                raise ValueError('missing executable')
            base = os.path.basename(argv[0])
            rows.append(dict(pid=pid,ppid=ppid,rss_bytes=rss*1024,cpu_lifetime_percent=cpu,
                             elapsed_seconds=elapsed,exe=base if base in EXECUTABLES else 'other',
                             task_identity=identify(argv)))
        except (ValueError,TypeError):
            malformed += 1
    # Preserve leading CPU/RSS workers and bounded parents. No argv survives.
    chosen = {}
    for metric in ('cpu_lifetime_percent','rss_bytes'):
        for p in sorted(rows,key=lambda x:x[metric],reverse=True)[:8]:
            chosen[p['pid']] = p
    by_pid = {p['pid']:p for p in rows}
    for p in list(chosen.values()):
        for _ in range(4):
            parent = by_pid.get(p['ppid'])
            if not parent or parent['pid'] in chosen or len(chosen)>=24:
                break
            chosen[parent['pid']] = parent; p = parent
    return dict(process_count=len(rows),rows_considered=min(len(lines)-1,2048),
                row_limit_hit=len(lines)>2049,malformed_rows=malformed,
                processes=list(chosen.values())[:24],
                limits='CPU is a lifetime average, RSS is a point snapshot. Guest PIDs/elapsed time are not host PID/start identities or swap ownership. Arguments, environment and paths are not retained.')


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
        r=run([docker,'top',c['ID'],'-eo','pid,ppid,rss,pcpu,etimes,args'],timeout=2,limit=256*1024)
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
