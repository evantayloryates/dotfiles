// Explicit opt-in physical acceptance; no business data mutations.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

if (!process.argv.includes('--run')) throw new Error('explicit_--run_required');
process.umask(0o077);
const dir = fs.mkdtempSync(path.join(os.homedir(), 'Library/Application Support/ios-agent/mcp-physical-'));
const receipt = {version: 1, at: new Date().toISOString(), transport: 'private-tailnet-existing-phone-link',
  actualHarnessCatalogRefreshed: false, gates: {}, privateEvidenceDirectory: dir};
const clients = [];
async function connect(name) {
  const client = new Client({name, version: '1'});
  const transport = new StdioClientTransport({command: path.join(os.homedir(), 'dotfiles/bin/ios-agent-mcp'), stderr: 'pipe'});
  transport.stderr?.on('data', () => {});
  await client.connect(transport); clients.push(client); return client;
}
async function call(client, name, args = {}) {
  const value = await client.callTool({name, arguments: args}, undefined, {timeout: 150000});
  fs.writeFileSync(path.join(dir, `${Date.now()}-${name}.json`), JSON.stringify(value), {mode: 0o600, flag: 'wx'});
  if (value.isError) throw new Error('gate_failed_' + name);
  return value.structuredContent;
}
let owner, session;
try {
  owner = await connect('independent-mcp-client-A');
  receipt.gates.discovery = (await owner.listTools()).tools.length === 15;
  const resources = await owner.listResources();
  receipt.gates.resources = resources.resources.length === 4;
  await owner.readResource({uri: 'ios-agent://mcp'});
  const begin = await call(owner, 'ios_begin'); session = begin.sessionId;
  receipt.gates.ready = begin.ready === true;
  const state = await call(owner, 'ios_native', {sessionId: session, action: 'state'});
  const baseline = state.data.domain.navigation.route;
  // Limit the physical input probe to the known reversible dashboard baseline.
  assert.equal(baseline, 'ClientDashboard');
  receipt.gates.remoteBundle = state.data.bundleSource === 'tailnet-Metro';
  const native = await call(owner, 'ios_verify', {sessionId: session, gate: 'native-tree'});
  receipt.gates.nativeTree = true;
  const react = await call(owner, 'ios_verify', {sessionId: session, gate: 'react-tree'});
  receipt.gates.reactTree = react.receipt.status === 'passed';
  for (const [label, route] of [['Nutrition', 'ClientMealLogs'], ['Home', 'ClientDashboard']]) {
    const tree = await call(owner, 'ios_native', {sessionId: session, action: 'tree'});
    const node = tree.data?.nodes.find(n => n.visible && n.interactive && n.label === label);
    if (!node) throw new Error('fresh_observed_tab_required');
    const [x, y, w, h] = node.rect;
    await call(owner, 'ios_native', {sessionId: session, action: 'tap', args: {snapshot: tree.data.snapshot, target: node.node, x: x + w / 2, y: y + h / 2}});
    await call(owner, 'ios_verify', {sessionId: session, gate: 'route', expected: route});
  }
  receipt.gates.nativeInputAndRouteRestore = true;
  const p = await call(owner, 'ios_learning_propose', {key: 'mcp-native-tree-readiness',
    lesson: 'The native tree gate passed through the MCP adapter on this runtime. Verify readiness before inspecting the tree.',
    evidenceId: native.learningEvidence.evidenceId, scope: 'runtime'});
  await call(owner, 'ios_learning_review', {lessonId: p.lessonId, state: 'supported',
    reason: 'The physical readiness and native tree gates passed during this adapter session.',
    evidenceId: native.learningEvidence.evidenceId});
  const ended = await call(owner, 'ios_end', {sessionId: session}); session = null;
  receipt.gates.explicitCleanup = ended.receipt.status === 'passed';
  const other = await connect('independent-mcp-client-B');
  const learning = await call(other, 'ios_learning_search', {query: 'mcp-native-tree-readiness'});
  receipt.gates.sharedLearning = learning.lessons.some(l => l.id === p.lessonId && l.state === 'supported');
  const begin2 = await call(other, 'ios_begin');
  // Exercise actual EOF cleanup on a separate process/lease, not a fake fixture.
  await other.close();
  receipt.gates.disconnectCleanup = (await call(owner, 'ios_verify', {gate: 'idle', timeout: 20})).receipt.status === 'passed';
  receipt.gates.allPassed = Object.values(receipt.gates).every(v => v === true);
  assert.equal(receipt.gates.allPassed, true);
} catch (error) {
  fs.writeFileSync(path.join(dir, 'error.json'), JSON.stringify({name: error.name, code: error.code, message: error.message}), {mode: 0o600});
  receipt.error = /^[A-Za-z0-9_-]{1,100}$/.test(error.message) ? error.message : 'physical_smoke_failed';
  receipt.gates.allPassed = false;
  process.exitCode = 1;
} finally {
  if (session && owner) await call(owner, 'ios_end', {sessionId: session}).catch(() => {});
  for (const client of clients) await client.close().catch(() => {});
  fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2), {mode: 0o600});
  const summary = {...receipt}; delete summary.privateEvidenceDirectory;
  console.log(JSON.stringify(summary));
}
