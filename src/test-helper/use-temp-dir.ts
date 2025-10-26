import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function useTempDir(prefix = 'aws-luminarlz-cli-') {
  const tmpBase = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tmpBase, prefix));
  process.chdir(directory);
  return {
    directory,
    restore() {
      process.chdir(process.cwd());
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}