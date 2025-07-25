import * as fs from 'fs';
import { loadConfigSync } from '../../config';
import { executeCommand } from '../util/exec';
import { resolveProjectPath } from '../util/path';

export const customizationsPublishCdkAssets = async () => {
  const config = loadConfigSync();
  const cdkOutFiles = fs
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

  function* chunks<T>(arr: T[], n: number) {
    for (let i = 0; i < arr.length; i += n) {
      yield arr.slice(i, i + n);
    }
  }

  // publish only 30 assets files at a time to avoid throttling
  const maxConcurrentUploads = 30;
  const filesToPublish: { file: string; region: string }[] = cdkOutFiles
    .flatMap((file) => {
      return config.enabledRegions.map((region) => ({
        file: file,
        region,
      }));
    });

  for (const chunk of chunks(filesToPublish, maxConcurrentUploads)) {
    const execs = chunk.map(({ file, region }) =>
      executeCommand(
        `export AWS_REGION="${region}" && npx cdk-assets publish -p "${file}"`,
        {
          cwd: resolveProjectPath(config.customizationPath),
        },
      ),
    );
    await Promise.all(execs);
  }
};