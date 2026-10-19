import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {inventoryRelease,RELEASE_FILE_LIMIT,RELEASE_BYTE_LIMIT} from '../src/lib/releases.mjs'
import {PINNED_RELEASE_FILE_LIMIT,PINNED_RELEASE_BYTE_LIMIT} from '../src/lib/runtime-entry.mjs'
test('stager and self-contained bootstrap enforce identical aggregate limits',()=>{assert.equal(RELEASE_FILE_LIMIT,PINNED_RELEASE_FILE_LIMIT);assert.equal(RELEASE_BYTE_LIMIT,PINNED_RELEASE_BYTE_LIMIT)})
const fixture=()=>mkdtempSync(join(tmpdir(),'release-inventory-'))
test('valid larger source package retains exact hashes up to bounded file limit',()=>{const dir=fixture();for(let i=0;i<RELEASE_FILE_LIMIT;i++)writeFileSync(join(dir,String(i)+'.mjs'),'fixture');const out=inventoryRelease(dir);assert.equal(Object.keys(out).length,RELEASE_FILE_LIMIT);assert.match(out['259.mjs'],/^[a-f0-9]{64}$/);writeFileSync(join(dir,'overflow.mjs'),'fixture');assert.throws(()=>inventoryRelease(dir),e=>e.category==='broker_runtime_invalid')})
test('aggregate byte ceiling, per-file ceiling and symlinks remain enforced',()=>{const dir=fixture(),chunk=Buffer.alloc(4*1024*1024);for(let i=0;i<RELEASE_BYTE_LIMIT/chunk.length;i++)writeFileSync(join(dir,String(i)),chunk);assert.equal(Object.keys(inventoryRelease(dir)).length,4);writeFileSync(join(dir,'overflow'),'x');assert.throws(()=>inventoryRelease(dir));const large=fixture();writeFileSync(join(large,'large'),Buffer.alloc(chunk.length+1));assert.throws(()=>inventoryRelease(large));const linked=fixture();symlinkSync(join(dir,'0'),join(linked,'alias'));assert.throws(()=>inventoryRelease(linked))})
