import * as fs from 'fs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as ziplib from 'zip-lib';
import { awsAcceleratorConfigBucketName, loadConfigSync } from '../../../config';
import { resolveProjectPath } from '../../util/path';

export const publishConfigOut = async ({ artifactPath }: {
  artifactPath?: string;
} = {}): Promise<void> => {
  const config = loadConfigSync();
  const outPath = resolveProjectPath(config.awsAcceleratorConfigOutPath);
  const zipFile = resolveProjectPath(
    `${config.awsAcceleratorConfigOutPath}.zip`,
  );
  const targetArtifactPath = artifactPath ?? config.awsAcceleratorConfigDeploymentArtifactPath;

  await ziplib.archiveFolder(outPath, zipFile);
  const client = new S3Client({ region: config.homeRegion });
  await client.send(
    new PutObjectCommand({
      Bucket: awsAcceleratorConfigBucketName(config),
      Key: targetArtifactPath,
      Body: fs.readFileSync(zipFile),
    }),
  );
};
