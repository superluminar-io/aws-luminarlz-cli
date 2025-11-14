import path from 'path';
import { ensureCheckoutExists, getCheckoutPath } from './checkout';
import { loadConfigSync, LZA_ACCELERATOR_PACKAGE_PATH, LZA_SOURCE_PATH } from '../../../config';
import { executeCommand } from '../../util/exec';
import { resolveProjectPath } from '../../util/path';
import { checkVersion } from '../installer/installer';

export const LZA_CUSTOMIZATIONS_STAGE = 'customizations';

export const validate = async () => {
  const config = loadConfigSync();
  const lzaConfigPath = resolveProjectPath(
    config.awsAcceleratorConfigOutPath,
  );

  const checkoutPath = getCheckoutPath();

  await checkVersion();

  await ensureCheckoutExists();

  await executeCommand(
    `yarn validate-config ${lzaConfigPath}`,
    {
      cwd: path.join(
        checkoutPath,
        LZA_SOURCE_PATH,
      ),
    },
  );
};

export const synthStages = async ({ stage, accountId, region }: {
  stage?: string;
  accountId?: string;
  region?: string;
}) => {
  const config = loadConfigSync();
  const lzaConfigPath = resolveProjectPath(
    config.awsAcceleratorConfigOutPath,
  );

  const checkoutPath = getCheckoutPath();

  await checkVersion();

  await ensureCheckoutExists();

  await executeCommand(
    `yarn run ts-node --transpile-only cdk.ts synth${stage ? ' --stage ' + stage : ''} --config-dir "${lzaConfigPath}" --partition aws${region ? ` --region "${region}"` : ''}${accountId ? ` --account "${accountId}"` : ''}`,
    {
      cwd: path.join(
        checkoutPath,
        LZA_ACCELERATOR_PACKAGE_PATH,
      ),
    },
  );
};

export const deployStage = async ({ stage }: {
  stage: string;
}) => {
  const config = loadConfigSync();
  const lzaConfigPath = resolveProjectPath(
    config.awsAcceleratorConfigOutPath,
  );

  const checkoutPath = getCheckoutPath();

  await checkVersion();

  await ensureCheckoutExists();

  await executeCommand(
    `yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage ${stage} --config-dir "${lzaConfigPath}" --partition aws`,
    {
      cwd: path.join(
        checkoutPath,
        LZA_ACCELERATOR_PACKAGE_PATH,
      ),
    },
  );
};

export const bootstrapStage = async () => {
  const config = loadConfigSync();
  const lzaConfigPath = resolveProjectPath(
    config.awsAcceleratorConfigOutPath,
  );

  const checkoutPath = getCheckoutPath();

  await checkVersion();

  await ensureCheckoutExists();

  await executeCommand(
    `yarn run ts-node --transpile-only cdk.ts bootstrap --require-approval never --config-dir "${lzaConfigPath}" --partition aws`,
    {
      cwd: path.join(
        checkoutPath,
        LZA_ACCELERATOR_PACKAGE_PATH,
      ),
    },
  );
};