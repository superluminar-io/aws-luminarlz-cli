import * as fs from 'fs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as ziplib from 'zip-lib';
import { awsAcceleratorConfigBucketName, loadConfigSync } from '../../../config';
import { resolveProjectPath } from '../../util/path';

export const publishConfigOut = async (): Promise<string | undefined> => {
  const config = loadConfigSync();
  const outPath = resolveProjectPath(config.awsAcceleratorConfigOutPath);
  const zipFile = resolveProjectPath(
    `${config.awsAcceleratorConfigOutPath}.zip`,
  );

  await ziplib.archiveFolder(outPath, zipFile);
  const client = new S3Client({ region: config.homeRegion });
  const response = await client.send(
    new PutObjectCommand({
      Bucket: awsAcceleratorConfigBucketName(config),
      Key: config.awsAcceleratorConfigDeploymentArtifactPath,
      Body: fs.readFileSync(zipFile),
    }),
  );
  return response.VersionId;
};