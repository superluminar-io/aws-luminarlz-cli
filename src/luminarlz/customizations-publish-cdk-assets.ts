import * as fs from 'fs';
import { loadConfigSync } from '../config';
import { execProm } from '../util/exec';
import { currentExecutionPath } from '../util/path';

export const customizationsPublishCdkAssets = async () => {
  const config = loadConfigSync();
  const assetsFiles = fs
    .readdirSync(currentExecutionPath(config.cdkOutPath), {
      recursive: true,
    })
    .map((fileName) => {
      if (!fileName || typeof fileName !== 'string') {
        throw new Error('Invalid file name');
      }
      return currentExecutionPath(config.cdkOutPath, fileName);
    })
    .filter((fileName) => {
      return (
        fs.lstatSync(fileName).isFile() && fileName.endsWith('.assets.json')
      );
    });
  const execs = [];
  for (const assetsFile of assetsFiles) {
    for (const region of config.enabledRegions) {
      execs.push(
        execProm(
          `export AWS_REGION="${region}" && npx cdk-assets publish -p "${assetsFile}"`,
          {
            cwd: currentExecutionPath(config.customizationPath),
          },
        ),
      );
    }
  }
  await Promise.all(execs);
};