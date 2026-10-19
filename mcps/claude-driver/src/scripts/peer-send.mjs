#!/usr/bin/env node
// peer-send.mjs: deliver one message to a live Claude Code session over the
// local peer protocol v1 (Unix socket inbox), with no LLM turn in the sender.
// Zero dependencies, Node >= 20. Reverse-engineered from Claude Code 2.1.284.
//
// Wire format (one connection per message, newline-delimited JSON):
//   {"type":"auth","token":"<RECEIVER's peerToken>"}\n
//   {"msgV":1,"msg_id":"<uuid>","type":"user","message":{"role":"user","content":"<wrapped>"},
//    "priority":"next","session_id":"<receiver sessionId>"}\n
// then half-close. The receiver sends nothing back on this connection.
//
// Usage:
//   node peer-send.mjs (--pid N | --session-id UUID | --host-session-id local_... | --name NAME)
//        --from-mode bypass|prompting|none  [--message TEXT | --message-file F | stdin]
//        [--from-name NAME] [--from uds:/tmp/cc-socks/<pid>.sock] [--priority next|now|later]
//        [--no-session-guard] [--dry-run] [--verify-transcript [--timeout-ms N]]
//
// Exit codes: 0 sent (and verified if asked), 2 usage, 3 target not found/ambiguous,
// 4 protocol/version refused, 5 socket error, 6 verification timed out.

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, lstatSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join, resolve, basename } from "node:path";

const SUPPORTED_PEER_PROTOCOL = 1;
const TAG = "cross-session-message";
const LINE_CAP = 1048576; // receiver drops connections whose buffered line exceeds this
const FROM_MODES = new Set(["bypass", "prompting"]);
const SESSIONS_DIR = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "sessions");
const PROJECTS_DIR = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");

function die(code, msg, extra = {}) {
  process.stdout.write(JSON.stringify({ ...extra, ok: false, error: msg }) + "\n");
  process.exit(code);
}

function parseArgs(argv) {
  const a = { priority: "next", sessionGuard: true, timeoutMs: 20000 };
  const need = (i) => { if (i + 1 >= argv.length) die(2, `missing value for ${argv[i]}`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    switch (k) {
      case "--pid": a.pid = Number(need(i)); i++; break;
      case "--session-id": a.sessionId = need(i); i++; break;
      case "--host-session-id": a.hostSessionId = need(i); i++; break;
      case "--name": a.name = need(i); i++; break;
      case "--message": a.message = need(i); i++; break;
      case "--message-file": a.message = readFileSync(need(i), "utf8"); i++; break;
      case "--from-mode": a.fromMode = need(i); i++; break;
      case "--from-name": a.fromName = need(i); i++; break;
      case "--from": a.from = need(i); i++; break;
      case "--priority": a.priority = need(i); i++; break;
      case "--no-session-guard": a.sessionGuard = false; break;
      case "--dry-run": a.dryRun = true; break;
      case "--verify-transcript": a.verify = true; break;
      case "--timeout-ms": a.timeoutMs = Number(need(i)); i++; break;
      case "-h": case "--help":
        process.stdout.write(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 20).join("\n") + "\n");
        process.exit(0);
      default: die(2, `unknown argument: ${k}`);
    }
  }
  const selectors = ["pid", "sessionId", "hostSessionId", "name"].filter((s) => a[s] !== undefined);
  if (selectors.length !== 1) die(2, "give exactly one of --pid, --session-id, --host-session-id, --name");
  if (a.fromMode === undefined) die(2, "--from-mode is required (bypass|prompting|none): it must match the receiver's mode or the message is held for approval");
  if (a.fromMode !== "none" && !FROM_MODES.has(a.fromMode)) die(2, "--from-mode must be bypass, prompting or none");
  if (!["next", "now", "later"].includes(a.priority)) die(2, "--priority must be next, now or later");
  if (a.from !== undefined && !/^(?:uds|bridge|did):[A-Za-z0-9%:_/.\\-]{1,200}$/.test(a.from)) die(2, "--from must be a uds:/bridge:/did: address");
  return a;
}

// Same start token the CLI stores as procStart ("Wed Sep 30 00:28:02 2026", UTC).
function procStartOf(pid) {
  try {
    return execFileSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
      env: { LC_ALL: "C", TZ: "UTC", PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 2000,
    }).trim() || undefined;
  } catch { return undefined; }
}

function isLive(rec) {
  try { process.kill(rec.pid, 0); } catch { return false; }
  if (rec.procStart === undefined) return true;
  return procStartOf(rec.pid) === rec.procStart; // guards against pid reuse
}

function loadLiveSessions() {
  let names;
  try { names = readdirSync(SESSIONS_DIR); } catch { die(3, `cannot read ${SESSIONS_DIR}`); }
  const out = [];
  for (const f of names) {
    if (!/^\d+\.json$/.test(f)) continue;
    let rec;
    try { rec = JSON.parse(readFileSync(join(SESSIONS_DIR, f), "utf8")); } catch { continue; }
    if (rec.pid !== Number(f.slice(0, -5))) continue;
    if (rec.spare === true || rec.parkedJobId !== undefined) continue; // not addressable, like the CLI
    if (!isLive(rec)) continue;
    out.push(rec);
  }
  return out;
}

// The CLI's name normalizer (Ir): NFKC, strip control/format chars, lowercase, spaces -> '-'.
const normName = (s) => s.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, (c) => (/\s/.test(c) ? c : "")).trim().toLowerCase().replace(/\s+/g, "-");

function resolveTarget(a, live) {
  let hits;
  if (a.pid !== undefined) hits = live.filter((r) => r.pid === a.pid);
  else if (a.sessionId !== undefined) hits = live.filter((r) => r.sessionId === a.sessionId);
  else if (a.hostSessionId !== undefined) hits = live.filter((r) => r.hostSessionId === a.hostSessionId);
  else {
    const n = normName(a.name);
    hits = live.filter((r) => normName(r.name || basename(r.cwd || "")) === n);
  }
  if (hits.length === 0) die(3, "no live session matches that selector");
  if (hits.length > 1) die(3, "selector is ambiguous", { candidates: hits.map((r) => ({ pid: r.pid, sessionId: r.sessionId, name: r.name })) });
  return hits[0];
}

// Key file: sessions/<receiverPid>.<sha256(path.resolve(socketPath))>.key, written by the receiver.
function readReceiverToken(rec) {
  const hash = createHash("sha256").update(resolve(rec.messagingSocketPath)).digest("hex");
  const file = join(SESSIONS_DIR, `${rec.pid}.${hash}.key`);
  if (!existsSync(file)) return { token: undefined, keyFile: file };
  const st = statSync(file);
  if (st.uid !== process.getuid()) die(4, "key file is not owned by this user; refusing");
  const j = JSON.parse(readFileSync(file, "utf8"));
  if (typeof j.peerToken !== "string" || !/^[0-9a-f]{32}$/.test(j.peerToken)) die(4, "key file has no valid peerToken");
  return { token: j.peerToken, keyFile: file };
}

// Receiver-side neutralization of a closing tag inside the body (ASCII subset of the CLI's Z1e):
// "<" that opens "</cross-session-message" becomes "<\". Lookalike-Unicode variants are refused
// rather than reproduced, because a mismatch makes the receiver ignore from-mode (and hold).
function escapeBody(body) {
  const escaped = body.replace(/<(?!\\)(?=\s*\/\s*cross[-_\s]*session[-_\s]*message)/giu, "<\\");
  if (/[^\x00-\x7f]/.test(body) && /cross.{0,3}session.{0,3}message/.test(body.normalize("NFKC").toLowerCase()))
    die(2, "message mixes non-ASCII text with the envelope tag name; rephrase it");
  return escaped;
}

function sanitizeName(s) {
  const t = s.replace(/["<>]/g, "").replace(/[\p{Cf}\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/gu, "").trim();
  const cps = [...t];
  return cps.length > 64 ? cps.slice(0, 64).join("") + "…" : t;
}

// Envelope the CLI's SendMessage builds (nYe); attribute order matters to the receiver's parser.
function wrap(body, { from, fromName, fromMode }) {
  const attrs = [];
  if (from) attrs.push(`from="${from}"`);
  const n = fromName ? sanitizeName(fromName) : "";
  if (n) attrs.push(`from-name="${n}"`);
  if (fromMode && fromMode !== "none") attrs.push(`from-mode="${fromMode}"`);
  return `<${TAG}${attrs.length ? " " + attrs.join(" ") : ""}>\n${escapeBody(body)}\n</${TAG}>`;
}

function send(sock, lines, timeoutMs = 5000) {
  return new Promise((ok, fail) => {
    const s = createConnection({ path: sock });
    let failed = false;
    s.setTimeout(timeoutMs, () => { failed = true; s.destroy(); fail(new Error(`timed out sending to ${sock}`)); });
    s.on("error", (e) => { failed = true; fail(e); });
    s.on("connect", () => {
      s.write(lines);
      // The CLI ends the socket 150 ms after writing on macOS (and at once elsewhere).
      setTimeout(() => { if (!s.destroyed) s.end(); }, process.platform === "darwin" ? 150 : 0);
    });
    s.on("close", () => { if (!failed) ok(); });
  });
}

function transcriptPath(rec) {
  const enc = rec.cwd.replace(/[^A-Za-z0-9]/g, "-");
  return join(PROJECTS_DIR, enc, `${rec.sessionId}.jsonl`);
}

async function verifyTranscript(rec, msgId, marker, timeoutMs) {
  const file = transcriptPath(rec);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line || !line.includes(marker)) continue;
        try {
          const e = JSON.parse(line);
          if (e.type === "user") return { file, uuid: e.uuid, origin: e.origin, timestamp: e.timestamp, msgIdMatched: JSON.stringify(e).includes(msgId) };
        } catch { /* partial line */ }
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return undefined;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.message === undefined) {
    if (process.stdin.isTTY) die(2, "no message: pass --message, --message-file or pipe stdin");
    a.message = readFileSync(0, "utf8");
  }
  if (a.message.trim().length === 0) die(2, "message is empty");

  const rec = resolveTarget(a, loadLiveSessions());
  if (rec.peerProtocol !== SUPPORTED_PEER_PROTOCOL)
    die(4, `target speaks peerProtocol ${rec.peerProtocol}; this client speaks ${SUPPORTED_PEER_PROTOCOL}`, { version: rec.version });
  const sock = rec.messagingSocketPath;
  if (typeof sock !== "string" || !/^\/\S*\.sock$/.test(sock)) die(4, "target has no local messagingSocketPath");
  const lst = lstatSync(sock, { throwIfNoEntry: false });
  if (!lst) die(5, "socket path does not exist (session gone?)");
  if (lst.isSymbolicLink() || !lst.isSocket()) die(5, "socket path is not a socket (or is a symlink); refusing");
  if (lst.uid !== process.getuid()) die(5, "socket is owned by another user; refusing");

  const { token, keyFile } = readReceiverToken(rec);
  const msgId = randomUUID();
  const frame = {
    msgV: 1,
    msg_id: msgId,
    type: "user",
    message: { role: "user", content: wrap(a.message, a) },
    priority: a.priority,
    ...(a.from !== undefined && { from: a.from }),
    ...(a.sessionGuard && rec.sessionId && { session_id: rec.sessionId }), // receiver drops on mismatch
  };
  const json = JSON.stringify(frame);
  const authLine = token ? JSON.stringify({ type: "auth", token }) + "\n" : "";
  if (authLine.length + json.length + 1 > LINE_CAP) die(2, "message too large for one inbox line (1 MiB); put bulk content in a file");

  const target = { pid: rec.pid, sessionId: rec.sessionId, name: rec.name, hostSessionId: rec.hostSessionId, sock, status: rec.status, version: rec.version };
  if (a.dryRun) {
    process.stdout.write(JSON.stringify({ ok: true, dryRun: true, target, keyFile, authenticated: Boolean(token), frame }, null, 1) + "\n");
    return;
  }
  try { await send(sock, authLine + json + "\n"); }
  catch (e) { die(5, `send failed: ${e.code || e.message}`, { target }); }

  const result = { ok: true, target, msgId, authenticated: Boolean(token), bytes: json.length };
  if (a.verify) {
    const marker = a.message.trim().split("\n")[0].slice(0, 80);
    const v = await verifyTranscript(rec, msgId, JSON.stringify(marker).slice(1, -1), a.timeoutMs);
    if (!v) die(6, "sent, but the message did not appear in the target transcript in time (held for approval, queued behind a busy turn, or dropped)", { ...result, transcript: transcriptPath(rec) });
    result.transcript = v;
  }
  process.stdout.write(JSON.stringify(result, null, 1) + "\n");
}

main().catch((e) => die(1, String(e && e.message || e)));
