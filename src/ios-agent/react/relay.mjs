// A lease-scoped, isolated standard React DevTools frontend. No USB dependency.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import WebSocket from 'ws';
const require = createRequire(import.meta.url);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = process.argv[2];
if (!state) throw new Error('private_state_directory_required');
process.umask(0o077);
let input = '';
for await (const part of process.stdin) {
  input += part.toString();
  if (input.length > 1024) throw new Error('invalid_lease_input');
}
const {lease} = JSON.parse(input);
if (typeof lease !== 'string') throw new Error('lease_required');
const frontendState = path.join(state, 'react');
fs.mkdirSync(frontendState, {recursive: true, mode: 0o700});
fs.chmodSync(frontendState, 0o700);
const daemon = path.join(path.dirname(require.resolve('agent-react-devtools')), 'daemon.js');
// The pinned provider supports isolated state but has no WebSocket authentication.
// Generate a private adapter without modifying the installed provider package.
const marker = 'new WebSocketServer({ port: this.port, host: "127.0.0.1" },';
let source = fs.readFileSync(daemon, 'utf8');
if (source.split(marker).length !== 2) throw new Error('provider_adapter_version_mismatch');
source = source.replace(marker, 'new WebSocketServer({ port: this.port, host: "127.0.0.1", verifyClient: info => info.req.headers.authorization === "Bearer " + iosAgentFrontendToken },');
const wsModule = pathToFileURL(path.join(path.dirname(require.resolve('ws')), 'wrapper.mjs')).href;
source = source.replace('from "ws"', `from ${JSON.stringify(wsModule)}`);
const protectedDaemon = path.join(frontendState, 'daemon-protected.mjs');
fs.writeFileSync(protectedDaemon, 'let iosAgentSecretInput = ""; for await (const chunk of process.stdin) { iosAgentSecretInput += chunk; if (iosAgentSecretInput.length > 1024) throw new Error("invalid_input"); } const iosAgentFrontendToken = JSON.parse(iosAgentSecretInput).token; iosAgentSecretInput = "";\n' + source, {mode: 0o600});
const frontendToken = randomBytes(32).toString('hex');
const child = spawn(process.execPath, [protectedDaemon, '--port=19497', '--state-dir=' + frontendState], {stdio: ['pipe', 'ignore', 'ignore']});
child.stdin.end(JSON.stringify({token: frontendToken}));
let socket, closed = false;
const messages = [];
function finish() {
  if (closed) return;
  closed = true;
  socket?.close();
  child.kill('SIGTERM');
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, finish);
child.on('exit', () => { closed = true; socket?.close(); });
function control(message) {
  return new Promise((resolve, reject) => {
    const connection = net.createConnection(path.join(state, 'control.sock'));
    let body = '';
    connection.setTimeout(5000, () => connection.destroy(new Error('control_timeout')));
    connection.on('connect', () => connection.end(JSON.stringify(message) + '\n'));
    connection.on('data', part => {
      body += part.toString();
      if (body.length > 8 * 1024 * 1024) connection.destroy(new Error('response_limit'));
    });
    connection.on('error', reject);
    connection.on('end', () => {
      try {
        const value = JSON.parse(body);
        if (value.error) reject(Object.assign(new Error('broker_rejected'), {code: value.error}));
        else resolve(value);
      } catch (error) { reject(error); }
    });
  });
}
async function action(args) {
  let accepted;
  while (!closed && !accepted) {
    try { accepted = await control({op: 'action', lease, action: 'react', args}); }
    catch (error) {
      if (error.code !== 'command_in_flight') throw error;
      await sleep(50); // Not accepted: safe to try admission again.
    }
  }
  if (!accepted) return;
  for (;;) {
    const result = await control({op: 'result', lease, id: accepted.id});
    if (result.status === 'completed') return result.result;
    if (closed || !['queued', 'sent'].includes(result.status)) throw new Error('outcome_unconfirmed');
    await sleep(50);
  }
}
try {
  const end = Date.now() + 5000;
  while (!fs.existsSync(path.join(frontendState, 'daemon.sock')) && Date.now() < end && !closed) await sleep(25);
  if (closed) throw new Error('frontend_failed');
  fs.chmodSync(path.join(frontendState, 'daemon.sock'), 0o600);
  socket = new WebSocket('ws://127.0.0.1:19497', {headers: {Authorization: 'Bearer ' + frontendToken}});
  socket.on('message', raw => {
    if (messages.length >= 128 || raw.length > 1048576) { finish(); return; }
    messages.push(raw.toString());
  });
  socket.on('error', finish);
  socket.on('close', finish);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  while (!closed) {
    const status = await control({op: 'status'});
    if (status.lease?.id !== lease) break;
    const result = await action(messages.length ? {message: messages.shift()} : {});
    if (!result || result.error || result.droppedFrames) throw new Error('react_stream_incomplete');
    for (const frame of result.frames || []) socket.send(frame);
    await sleep(150);
  }
} catch {
  // Component/model contents and control errors never enter service logs.
} finally {
  finish();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(1000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
