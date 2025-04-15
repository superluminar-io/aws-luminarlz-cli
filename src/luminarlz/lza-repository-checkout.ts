import fs from 'fs';
import os from 'node:os';
import path from 'path';
import {
  awsAcceleratorInstallerRepositoryBranchName,
  loadConfigSync,
  LZA_REPOSITORY_GIT_URL,
  LZA_SOURCE_PATH,
} from '../config';
import { execProm } from '../util/exec';

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