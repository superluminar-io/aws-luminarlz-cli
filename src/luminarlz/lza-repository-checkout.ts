import fs from 'fs';
import os from 'node:os';
import path from 'path';
import {
  awsAcceleratorInstallerRepositoryBranchName,
  loadConfigSync,
  LZA_ACCELERATOR_PACKAGE_PATH,
  LZA_REPOSITORY_GIT_URL,
  LZA_SOURCE_PATH,
} from '../config';
import { checkInstallerVersion } from './accelerator-installer';
import { execProm } from '../util/exec';
import { currentExecutionPath } from '../util/path';

export const lzaRepositoryCheckoutPath = () => {
  const config = loadConfigSync();
  return path.join(
    os.tmpdir(),
    `landing-zone-accelerator-on-aws-${awsAcceleratorInstallerRepositoryBranchName(config).replace('/', '-')}`,
  );
};

export const ensureLzaRepositoryIsCloned = async () => {
  const config = loadConfigSync();
  const checkoutPath = lzaRepositoryCheckoutPath();
  const checkoutBranch = awsAcceleratorInstallerRepositoryBranchName(config);
  if (!fs.existsSync(checkoutPath)) {
    await execProm(
      `git clone --depth=1 --branch ${checkoutBranch} ${LZA_REPOSITORY_GIT_URL} ${checkoutPath}`,
    );
    console.log('Cloned landing-zone-accelerator-on-aws repository.');
    await execProm('yarn && yarn build', {
      cwd: path.join(checkoutPath, LZA_SOURCE_PATH),
    });
  }
};


export const awsAcceleratorSynth = async ({ accountId, region }: {
  accountId: string;
  region: string;
}) => {
  const config = loadConfigSync();
  const lzaConfigPath = currentExecutionPath(
    config.awsAcceleratorConfigOutPath,
  );

  const checkoutPath = lzaRepositoryCheckoutPath();

  await checkInstallerVersion();

  await ensureLzaRepositoryIsCloned();

  await execProm(
    `yarn run ts-node --transpile-only cdk.ts synth --stage customizations --config-dir "${lzaConfigPath}" --region "${region}" --account "${accountId}" --partition aws`,
    {
      cwd: path.join(
        checkoutPath,
        LZA_ACCELERATOR_PACKAGE_PATH,
      ),
    },
  );
};

export const awsAcceleratorSynthStage = async ({ stage }: {
  stage: string;
}) => {
  const config = loadConfigSync();
  const lzaConfigPath = currentExecutionPath(
    config.awsAcceleratorConfigOutPath,
  );

  const checkoutPath = lzaRepositoryCheckoutPath();

  await checkInstallerVersion();

  await ensureLzaRepositoryIsCloned();

  await execProm(
    `yarn run ts-node --transpile-only cdk.ts synth --stage ${stage} --config-dir "${lzaConfigPath}" --partition aws`,
    {
      cwd: path.join(
        checkoutPath,
        LZA_ACCELERATOR_PACKAGE_PATH,
      ),
    },
  );
};

export const awsAcceleratorDeployStage = async ({ stage }: {
  stage: string;
}) => {
  const config = loadConfigSync();
  const lzaConfigPath = currentExecutionPath(
    config.awsAcceleratorConfigOutPath,
  );

  const checkoutPath = lzaRepositoryCheckoutPath();

  await checkInstallerVersion();

  await ensureLzaRepositoryIsCloned();

  await execProm(
    `yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage ${stage} --config-dir "${lzaConfigPath}" --partition aws`,
    {
      cwd: path.join(
        checkoutPath,
        LZA_ACCELERATOR_PACKAGE_PATH,
      ),
    },
  );
};

export const readTemplateBody = ({
  accountId,
  region,
  stackName,
}: {
  accountId: string;
  region: string;
  stackName: string;
}) => {
  return fs.readFileSync(
    path.join(
      lzaRepositoryCheckoutPath(),
      LZA_ACCELERATOR_PACKAGE_PATH,
      'cdk.out',
      `AWSAccelerator-CustomizationsStack-${accountId}-${region}`,
      `${stackName}-${accountId}-${region}.template.json`,
    ),
    'utf8',
  );
};