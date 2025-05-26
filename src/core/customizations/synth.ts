import { loadConfigSync } from '../../config';
import { executeCommand } from '../util/exec';
import { resolveProjectPath } from '../util/path';

export const customizationsCdkSynth = async (stackName?: string) => {
  const { customizationPath } = loadConfigSync();
  await executeCommand(`npx cdk synth ${stackName ?? ''}`, {
    cwd: resolveProjectPath(customizationPath),
  });
};