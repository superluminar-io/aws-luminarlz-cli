import fs from 'fs';
import path from 'path';
import {
  awsAcceleratorInstallerRepositoryBranchName,
  loadConfigSync,
  LZA_ACCELERATOR_PACKAGE_PATH,
  LZA_REPOSITORY_GIT_URL,
  LZA_SOURCE_PATH,
} from '../../../config';
import { executeCommand } from '../../util/exec';
import { resolveProjectPath } from '../../util/path';

export const getCheckoutPath = () => {
  const config = loadConfigSync();
  return path.join(
    resolveProjectPath(),
    `.landing-zone-accelerator-on-aws-${awsAcceleratorInstallerRepositoryBranchName(config).replace('/', '-')}`,
  );
};

export const ensureCheckoutExists = async () => {
  const config = loadConfigSync();
  const checkoutPath = getCheckoutPath();
  const checkoutBranch = awsAcceleratorInstallerRepositoryBranchName(config);
  if (!fs.existsSync(checkoutPath)) {
    await executeCommand(
      `git clone --depth=1 --branch ${checkoutBranch} ${LZA_REPOSITORY_GIT_URL} ${checkoutPath}`,
    );
    console.log('Cloned landing-zone-accelerator-on-aws repository.');
    await executeCommand('yarn && yarn build', {
      cwd: path.join(checkoutPath, LZA_SOURCE_PATH),
    });
  }
};


export const readCustomizationsStackTemplateBody = ({
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
      getCheckoutPath(),
      LZA_ACCELERATOR_PACKAGE_PATH,
      'cdk.out',
      `AWSAccelerator-CustomizationsStack-${accountId}-${region}`,
      `${stackName}-${accountId}-${region}.template.json`,
    ),
    'utf8',
  );
};