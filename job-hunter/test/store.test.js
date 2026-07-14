import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJsonl, writeJsonl } from '../src/store/jsonl-store.js';
import { atomicWrite } from '../src/store/atomic-write.js';
import { acquireLock, inspectLock, LockConflictError } from '../src/store/lock.js';

const tmp=()=>fs.mkdtemp(path.join(os.tmpdir(),'job-hunter-test-'));
test('JSONL tolerates blank lines and reports malformed line numbers',async()=>{const d=await tmp(),f=path.join(d,'x.jsonl');await fs.writeFile(f,'{"a":1}\n\n');assert.deepEqual(await readJsonl(f),[{a:1}]);await fs.writeFile(f,'{"a":1}\nnope\n');await assert.rejects(readJsonl(f),/:2: malformed JSON/);});
test('atomic rewrite preserves original when interrupted before rename',async()=>{const d=await tmp(),f=path.join(d,'x');await fs.writeFile(f,'old');await assert.rejects(atomicWrite(f,'new',{beforeRename:()=>{throw new Error('interrupt');}}),/interrupt/);assert.equal(await fs.readFile(f,'utf8'),'old');assert.deepEqual((await fs.readdir(d)).sort(),['x']);});
test('JSONL writes whole records atomically',async()=>{const d=await tmp(),f=path.join(d,'x.jsonl');await writeJsonl(f,[{a:1},{b:2}]);assert.deepEqual(await readJsonl(f),[{a:1},{b:2}]);});
test('active and stale locks are explained and never silently removed',async()=>{const d=await tmp(),f=path.join(d,'lock');const release=await acquireLock('test',f);await assert.rejects(acquireLock('second',f),LockConflictError);assert.equal((await inspectLock(f)).active,true);await release();await fs.writeFile(f,JSON.stringify({pid:99999999,started_at:'2020-01-01T00:00:00Z',command:'old'}));await assert.rejects(acquireLock('third',f),/stale lock/);assert.equal((await inspectLock(f)).exists,true);});
