import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function useTempDir(prefix = 'aws-luminarlz-cli-') {
  const originalCwd = process.cwd();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.chdir(directory);
  return {
    directory,
    restore() {
      try {
        process.chdir(originalCwd);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  };
}