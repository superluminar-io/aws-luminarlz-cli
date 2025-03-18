import * as fs from 'fs';
import * as path from 'path';
import {
  loadConfigSync,
  LZA_ACCELERATOR_PACKAGE_PATH,
  LZA_REPOSITORY_BRANCH,
  LZA_REPOSITORY_CHECKOUT_PATH,
  LZA_SOURCE_PATH,
} from '../config';
import { execProm } from '../util/exec';
import { currentExecutionPath } from '../util/path';

export const customizationsCdkSynth = async (stackName?: string) => {
  const { customizationPath } = loadConfigSync();
  await execProm(`npx cdk synth ${stackName ?? ''}`, {
    cwd: currentExecutionPath(customizationPath),
  });
};

export const awsAcceleratorSynth = async ({ accountId, region }: {
  accountId: string;
  region: string;
}) => {
  const config = loadConfigSync();
  const lzaConfigPath = currentExecutionPath(
    config.awsAcceleratorConfigOutPath,
  );

  if (!fs.existsSync(LZA_REPOSITORY_CHECKOUT_PATH)) {
    const lzaRepositoryGitUrl =
      'https://github.com/awslabs/landing-zone-accelerator-on-aws.git';
    await execProm(
      `git clone --depth=1 --branch ${LZA_REPOSITORY_BRANCH} ${lzaRepositoryGitUrl} ${LZA_REPOSITORY_CHECKOUT_PATH}`,
    );
    console.log('Cloned landing-zone-accelerator-on-aws repository.');
    await execProm('yarn && yarn build', {
      cwd: path.join(LZA_REPOSITORY_CHECKOUT_PATH, LZA_SOURCE_PATH),
    });
  }

  await execProm(
    `yarn run ts-node --transpile-only cdk.ts synth --stage customizations --config-dir "${lzaConfigPath}" --region "${region}" --account "${accountId}" --partition aws`,
    {
      cwd: path.join(
        LZA_REPOSITORY_CHECKOUT_PATH,
        LZA_ACCELERATOR_PACKAGE_PATH,
      ),
    },
  );
};