// Fixture logs must never enter the installed service's diagnostic store.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-agent-test-signals-'));
const root=path.dirname(fileURLToPath(import.meta.url));
const files=process.argv.slice(2);
try {
 const result=spawnSync(process.execPath,['--test',...(files.length?files:fs.readdirSync(root).filter(n=>n.endsWith('.test.mjs')).map(n=>path.join(root,n)))],
  {stdio:'inherit',env:{...process.env,IOS_AGENT_SIGNAL_STATE_DIR:dir}});
 process.exitCode=result.status??1;
} finally {fs.rmSync(dir,{recursive:true,force:true});}
