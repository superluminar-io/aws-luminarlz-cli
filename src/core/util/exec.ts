import { exec } from 'node:child_process';
import { promisify } from 'node:util';

export const executeCommand = (
  command: Parameters<typeof exec>[0],
  opts?: Parameters<typeof exec>[1],
) => {
  const promise = promisify(exec)(command, opts);
  promise.child.stderr?.pipe(process.stderr);
  promise.child.stdout?.pipe(process.stdout);
  return promise;
};
