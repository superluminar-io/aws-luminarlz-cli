import { loadConfigSync } from '../config';
import { execProm } from '../util/exec';
import { currentExecutionPath } from '../util/path';

export const customizationsCdkSynth = async (stackName?: string) => {
  const { customizationPath } = loadConfigSync();
  await execProm(`npx cdk synth ${stackName ?? ''}`, {
    cwd: currentExecutionPath(customizationPath),
  });
};