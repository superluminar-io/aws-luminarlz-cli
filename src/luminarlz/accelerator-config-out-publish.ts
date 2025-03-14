import * as fs from 'fs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as ziplib from 'zip-lib';
import { awsAcceleratorConfigBucketName, loadConfigSync } from '../config';
import { currentExecutionPath } from '../util/path';

export const acceleratorConfigOutPublish = async () => {
  const config = loadConfigSync();
  const outPath = currentExecutionPath(config.awsAcceleratorConfigOutPath);
  const zipFile = currentExecutionPath(
    `${config.awsAcceleratorConfigOutPath}.zip`,
  );

  await ziplib.archiveFolder(outPath, zipFile);
  const client = new S3Client({ region: config.homeRegion });
  await client.send(
    new PutObjectCommand({
      Bucket: awsAcceleratorConfigBucketName(config),
      Key: 'zipped/aws-accelerator-config.zip',
      Body: fs.readFileSync(zipFile),
    }),
  );
};