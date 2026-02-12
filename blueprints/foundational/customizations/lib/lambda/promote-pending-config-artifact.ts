import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';

const s3 = new S3Client({});

const getRequiredEnvironment = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const toCopySource = (bucket: string, key: string): string => {
  const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
  return `${bucket}/${encodedKey}`;
};

const isObjectMissing = (error: unknown): boolean => {
  if (!(error instanceof S3ServiceException)) {
    return false;
  }
  return error.name === 'NotFound' || error.$metadata.httpStatusCode === 404;
};

export const handler = async (): Promise<void> => {
  const bucket = getRequiredEnvironment('CONFIG_BUCKET');
  const activeKey = getRequiredEnvironment('ACTIVE_ARTIFACT_KEY');
  const pendingKey = getRequiredEnvironment('PENDING_ARTIFACT_KEY');

  try {
    await s3.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: pendingKey,
    }));
  } catch (error) {
    if (isObjectMissing(error)) {
      return;
    }
    throw error;
  }

  await s3.send(new CopyObjectCommand({
    Bucket: bucket,
    CopySource: toCopySource(bucket, pendingKey),
    Key: activeKey,
  }));

  await s3.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: pendingKey,
  }));
};
