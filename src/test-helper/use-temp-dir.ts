import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function useTempDir(prefix = 'aws-luminarlz-cli-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.chdir(dir);
  return {
    dir,
    restore() { fs.rmSync(dir, { recursive: true, force: true }); },
  };
}