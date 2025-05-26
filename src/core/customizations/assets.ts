import * as fs from 'fs';
import { loadConfigSync } from '../../config';
import { executeCommand } from '../util/exec';
import { resolveProjectPath } from '../util/path';

export const customizationsPublishCdkAssets = async () => {
  const config = loadConfigSync();
  const assetsFiles = fs
    .readdirSync(resolveProjectPath(config.cdkOutPath), {
      recursive: true,
    })
    .map((fileName) => {
      if (!fileName || typeof fileName !== 'string') {
        throw new Error('Invalid file name');
      }
      return resolveProjectPath(config.cdkOutPath, fileName);
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
        executeCommand(
          `export AWS_REGION="${region}" && npx cdk-assets publish -p "${assetsFile}"`,
          {
            cwd: resolveProjectPath(config.customizationPath),
          },
        ),
      );
    }
  }
  await Promise.all(execs);
};