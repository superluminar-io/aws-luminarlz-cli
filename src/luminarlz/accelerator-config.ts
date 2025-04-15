import path from 'path';
import { loadConfigSync, LZA_SOURCE_PATH } from '../config';
import { checkInstallerVersion } from './accelerator-installer';
import { ensureLzaRepositoryIsCloned, lzaRepositoryCheckoutPath } from './lza-repository-checkout';
import { execProm } from '../util/exec';
import { currentExecutionPath } from '../util/path';


export const validateConfig = async () => {
  const config = loadConfigSync();
  const lzaConfigPath = currentExecutionPath(
    config.awsAcceleratorConfigOutPath,
  );

  const checkoutPath = lzaRepositoryCheckoutPath();

  await checkInstallerVersion();

  await ensureLzaRepositoryIsCloned();

  await execProm(
    `yarn validate-config ${lzaConfigPath}`,
    {
      cwd: path.join(
        checkoutPath,
        LZA_SOURCE_PATH,
      ),
    },
  );
};