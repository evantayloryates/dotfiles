import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export async function atomicWrite(filePath, contents, { beforeRename } = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
  let handle;
  try {
    handle = await fs.open(tempPath, 'wx', 0o600);
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = null;
    if (beforeRename) await beforeRename(tempPath);
    await fs.rename(tempPath, filePath);
    const dir = await fs.open(path.dirname(filePath), 'r');
    await dir.sync().catch(() => {});
    await dir.close();
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}
