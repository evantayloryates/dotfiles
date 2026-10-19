// macOS Seatbelt confinement for fixer sessions. The whole Claude Code
// process tree runs under sandbox-exec, so Bash, Edit, Write and anything
// they spawn share one boundary:
// - writes: only the workspace (which holds the session's own config dir and
//   temp dir) and a few device files;
// - reads: everything Node and Claude Code need, except secrets: SSH and
//   cloud keys, the dotfiles and harness .env files, Gmail tokens, the
//   keychain, 1Password, the real Claude and Codex configs;
// - network: allowed (the model API needs it); exfiltration is bounded by
//   what the session can read.

import { chmodSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const H = homedir()
const real = (p) => { try { return realpathSync(p) } catch { return p } }
const DOTFILES = real(join(H, 'dotfiles'))

export const SECRET_READS = [
  join(H, '.ssh'),
  join(H, '.aws'),
  join(H, '.gnupg'),
  join(H, '.gmail-mcp-accounts'),
  join(H, '.zdr-harness'),
  join(H, '.config/op'),
  join(H, '.codex'),
  join(H, '.claude'),
  real(join(H, '.claude.json')),
  join(H, 'Library/Keychains'),
  join(H, 'Library/Group Containers/2BUA8C4S2C.com.1password'),
  join(H, 'Library/Application Support/Claude'),
  join(DOTFILES, '.env'),
  join(DOTFILES, 'apps/zdr-agent/.env'),
  join(DOTFILES, 'src/mcps/host-config'),
]

const q = (p) => JSON.stringify(p)
const LAB = real(join(dirname(fileURLToPath(import.meta.url)), '..'))

// Reads under /Users are an allow list (6.4): the workspace, the Claude CLI
// install, and the read-only code ./check runs. Everything else in a home
// folder is unreadable, including secrets nobody thought to list.
// ANCHOR_SANDBOX_READS=denylist restores the old deny list only.
export const READ_ALLOW = [
  join(H, '.local/share/claude'),
  join(H, '.local/bin'),
  join(LAB, 'src'),
  real(join(LAB, '../_shared/kernel')),
]
const ancestors = (p) => { const out = []; let d = dirname(p); while (d && d !== '/' && !out.includes(d)) { out.push(d); d = dirname(d) } return out }

export function profile(workspace, { extraReads = [] } = {}) {
  const ws = real(workspace)
  const allow = [...READ_ALLOW, ...extraReads].map(real)
  return [
    '(version 1)',
    '(allow default)',
    '; Writes: nothing, then the workspace and device files.',
    '(deny file-write* (subpath "/"))',
    `(allow file-write* (subpath ${q(ws)}))`,
    '(allow file-write* (literal "/dev/null") (literal "/dev/zero") (literal "/dev/dtracehelper") (regex #"^/dev/tty") (regex #"^/dev/fd/") (regex #"^/dev/ptmx$") (regex #"^/dev/ttys"))',
    '; No asking other processes to act outside the sandbox: AppleEvents to',
    '; other apps, and app launches through LaunchServices (`open`).',
    '; No handing work to something outside the sandbox: launchd jobs,',
    '; AppleScript, app launches.',
    '(deny process-exec (literal "/bin/launchctl") (literal "/usr/bin/osascript") (literal "/usr/bin/open"))',
    '(deny appleevent-send)',
    '; No local sockets (anchor\'s own daemon, the 1Password broker, other',
    '; agents) and no pasteboard: the model API is reached over TCP only.',
    '(deny network-outbound (remote unix-socket))',
    '; except name resolution, which macOS does through mDNSResponder\'s socket.',
    '(allow network-outbound (remote unix-socket (path-literal "/private/var/run/mDNSResponder")))',
    '(deny mach-lookup (global-name "com.apple.pasteboard.1"))',
    '(deny mach-lookup (global-name "com.apple.coreservices.launchservicesd") (global-name "com.apple.lsd.mapdb") (global-name "com.apple.lsd.open") (global-name "com.apple.coreservices.quarantine-resolver"))',
    '; Reads: no secrets, listed or not.',
    ...SECRET_READS.map((p) => `(deny file-read* (subpath ${q(real(p))}))`),
    ...(process.env.ANCHOR_SANDBOX_READS === 'denylist' ? [] : [
      '(deny file-read* (subpath "/Users"))',
      `(allow file-read* (literal ${q(join(H, '.CFUserTextEncoding'))}))`,
      ...allow.map((p) => `(allow file-read* (subpath ${q(p)}))`),
      ...[...new Set([ws, ...allow].flatMap(ancestors))].map((d) => `(allow file-read-metadata (literal ${q(d)}))`),
    ]),
    '; The session may read its own workspace even if it sits under a denied path.',
    `(allow file-read* (subpath ${q(ws)}))`,
  ].join('\n') + '\n'
}

// Writes the profile, a private config dir and temp dir, and a wrapper that
// runs a command inside the sandbox. Returns the wrapper path and the env
// the session should get.
export function prepare(workspace, cli, { extraReads = [] } = {}) {
  const ws = real(workspace)
  const config = join(ws, '.claude-config')
  const tmp = join(ws, '.tmp')
  mkdirSync(config, { recursive: true })
  mkdirSync(tmp, { recursive: true })
  const sb = join(ws, '.sandbox.sb')
  // The CLI being run is readable wherever it lives (the real install is in
  // READ_ALLOW; a test double sits in the lab's harness folder).
  writeFileSync(sb, profile(ws, { extraReads: [dirname(real(cli)), ...extraReads] }))
  const wrapper = join(ws, '.sandboxed')
  writeFileSync(wrapper, `#!/bin/sh\nexec /usr/bin/sandbox-exec -f ${q(sb)} ${q(cli)} "$@"\n`)
  chmodSync(wrapper, 0o755)
  // Claude Code's Bash tool keeps its own temp folder (default /tmp/claude-<uid>);
  // CLAUDE_CODE_TMPDIR moves it inside the workspace with everything else.
  // zsh writes here-documents to $TMPPREFIX (default /tmp/zsh): keep them in the workspace too.
  return { wrapper, env: { CLAUDE_CONFIG_DIR: config, TMPDIR: tmp + '/', CLAUDE_CODE_TMPDIR: tmp, TMPPREFIX: join(tmp, 'zsh') } }
}

// Profile for running code a fixer wrote (the release check's probes): no
// network, no programs but node, writes only to a private temp folder, and
// home-folder reads limited to the allow list plus the folder being checked.
// Fixers write only .mjs, .js, .json and .md files, so no native addon can
// reach the system's services another way.
export function checkProfile(dir, tmp) {
  const d = real(dir)
  const allow = [...READ_ALLOW.map(real), d]
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(deny file-write* (subpath "/"))',
    `(allow file-write* (literal "/dev/null") (regex #"^/dev/fd/") (subpath ${q(real(tmp))}))`,
    '; It may run node and nothing else: no shell, no launchctl, no helpers.',
    '(deny process-exec*)',
    `(allow process-exec (literal ${q(real(process.execPath))}))`,
    '; No children (so nothing outlives the probe) and no native code from',
    '; the folders it can write or is checking.',
    '(deny process-fork)',
    `(deny file-map-executable (subpath ${q(real(tmp))}) (subpath ${q(d)}))`,
    '(deny appleevent-send)',
    '(deny mach-lookup (global-name "com.apple.coreservices.launchservicesd") (global-name "com.apple.lsd.mapdb") (global-name "com.apple.lsd.open") (global-name "com.apple.coreservices.quarantine-resolver") (global-name "com.apple.pasteboard.1"))',
    ...SECRET_READS.map((p) => `(deny file-read* (subpath ${q(real(p))}))`),
    '(deny file-read* (subpath "/Users"))',
    `(allow file-read* (literal ${q(join(H, '.CFUserTextEncoding'))}))`,
    ...allow.map((p) => `(allow file-read* (subpath ${q(p)}))`),
    ...[...new Set(allow.flatMap(ancestors))].map((x) => `(allow file-read-metadata (literal ${q(x)}))`),
  ].join('\n') + '\n'
}
