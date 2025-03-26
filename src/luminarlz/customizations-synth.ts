import * as fs from 'fs';
import os from 'node:os';
import * as path from 'path';
import * as ssm from '@aws-sdk/client-ssm';
import {
  AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
  loadConfigSync,
  LZA_ACCELERATOR_PACKAGE_PATH, LZA_REPOSITORY_GIT_URL,
  LZA_SOURCE_PATH,
} from '../config';
import { execProm } from '../util/exec';
import { currentExecutionPath } from '../util/path';

const lzaRepositoryBranch = () => {
  const config = loadConfigSync();
  return `release/v${config.awsAcceleratorVersion}`;
};
const lzaRepositoryCheckoutPath = () => {
  return path.join(
    os.tmpdir(),
    `landing-zone-accelerator-on-aws-${lzaRepositoryBranch().replace('/', '-')}`,
  );
};

const getAwsAcceleratorInstallerStackVersion = async () => {
  const config = loadConfigSync();
  const client = new ssm.SSMClient({ region: config.homeRegion });
  const result = await client.send(new ssm.GetParameterCommand({
    Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
  }));
  if (!result.Parameter?.Value) {
    throw new Error('AWS Accelerator version not found');
  }
  return result.Parameter.Value;
};

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
  const checkoutBranch = lzaRepositoryBranch();

  const installedVersion = await getAwsAcceleratorInstallerStackVersion();
  if (installedVersion !== config.awsAcceleratorVersion) {
    throw new Error(`
      AWS Accelerator version mismatch.
      The CLI should have the same version configured as the installed AWS Accelerator.
      Installed version: ${installedVersion}
      Configured version: ${config.awsAcceleratorVersion}
    `);
  }

  if (!fs.existsSync(checkoutPath)) {
    await execProm(
      `git clone --depth=1 --branch ${checkoutBranch} ${LZA_REPOSITORY_GIT_URL} ${checkoutPath}`,
    );
    console.log('Cloned landing-zone-accelerator-on-aws repository.');
    await execProm('yarn && yarn build', {
      cwd: path.join(checkoutPath, LZA_SOURCE_PATH),
    });
  }

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