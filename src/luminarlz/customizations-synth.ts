import * as fs from 'fs';
import * as path from 'path';
import {
  loadConfigSync,
  LZA_ACCELERATOR_PACKAGE_PATH,
} from '../config';
import { checkInstallerVersion } from './accelerator-installer';
import { ensureLzaRepositoryIsCloned, lzaRepositoryCheckoutPath } from './lza-repository-checkout';
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