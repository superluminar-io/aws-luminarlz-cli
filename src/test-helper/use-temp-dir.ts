import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function useTempDir(prefix = 'aws-luminarlz-cli-') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.chdir(directory);
  return {
    directory,
    restore() { fs.rmSync(directory, { recursive: true, force: true }); },
  };
}