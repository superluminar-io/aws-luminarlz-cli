import fs from 'node:fs';
import path from 'node:path';
import { useTempDir } from './use-temp-dir';
import { executeCommand } from '../../src/core/util/exec';

export const installLocalCliForTests = async (temp: ReturnType<typeof useTempDir>) => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const libEntry = path.join(repoRoot, 'lib', 'index.js');
  if (!fs.existsSync(libEntry)) {
    await executeCommand('yarn compile', { cwd: repoRoot });
  }
  const packageJsonPath = path.join(temp.directory, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = packageJson.dependencies ?? {};

  dependencies['@superluminar-io/aws-luminarlz-cli'] = `file:${repoRoot}`;
  packageJson.dependencies = dependencies;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

  await executeCommand('npm install', { cwd: temp.directory });
};
