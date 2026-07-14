import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../paths.js';
import { nowIso } from '../util.js';

export async function quarantine({ source, record, errors, dataDir = DATA_DIR }) {
  const stamp = nowIso();
  const target = path.join(dataDir, 'quarantine', stamp.slice(0, 10) + '.jsonl');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify({ schema_version: 1, quarantined_at: stamp, source, errors, record })}\n`, { mode: 0o600 });
  return target;
}
