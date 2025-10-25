import fs from 'fs';
import path from 'path';
import { DescribeOrganizationCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Deploy } from '../../src/commands/deploy';
import { Init } from '../../src/commands/init';
import {
  AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
  awsAcceleratorConfigBucketName,
  Config,
  loadConfigSync,
} from '../../src/config';
import * as assets from '../../src/core/customizations/assets';
import { executeCommand } from '../../src/core/util/exec';
import { createCliFor, runCli } from '../../src/test-helper/cli';
import { useTempDir } from '../../src/test-helper/use-temp-dir';

let temp: ReturnType<typeof useTempDir>;
describe('Deploy command', () => {
  const ssmMock = mockClient(SSMClient);
  const stsMock = mockClient(STSClient);
  const organizationsMock = mockClient(OrganizationsClient);
  const ssoAdminMock = mockClient(SSOAdminClient);
  const s3Mock = mockClient(S3Client);

  let customizationsPublishCdkAssetsSpy: jest.SpyInstance;

  beforeEach(() => {
    temp = useTempDir();

    ssmMock.reset();
    stsMock.reset();
    organizationsMock.reset();
    ssoAdminMock.reset();
    s3Mock.reset();

    jest.clearAllMocks();

    customizationsPublishCdkAssetsSpy = jest.spyOn(assets, 'customizationsPublishCdkAssets').mockResolvedValue();

    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
        Value: '1.12.2',
        Type: 'String',
      },
    });

    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:role/Admin',
      UserId: 'AROAEXAMPLE123',
    });

    organizationsMock.on(DescribeOrganizationCommand).resolves({
      Organization: {
        Id: 'o-exampleorg',
        Arn: 'arn:aws:organizations::123456789012:organization/o-exampleorg',
        MasterAccountId: '123456789012',
      },
    });

    organizationsMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: 'r-exampleroot',
          Arn: 'arn:aws:organizations::123456789012:root/o-exampleorg/r-exampleroot',
          Name: 'Root',
        },
      ],
    });

    ssoAdminMock.on(ListInstancesCommand).resolves({
      Instances: [
        {
          InstanceArn: 'arn:aws:sso:::instance/ssoins-example',
          IdentityStoreId: 'd-example123',
        },
      ],
    });
  });

  afterEach(() => {
    temp.restore();
  });

  it('should deploy after initializing a project with the specified blueprint', async () => {
    const cli = createCliFor(Init, Deploy);

    await runCli(cli, [
      'init',
      '--accounts-root-email', 'test@example.com',
      '--region', 'us-east-1',
    ], temp);
    await executeCommand('npm install', { cwd: temp.dir });
    await runCli(cli, ['deploy'], temp);

    const config = loadConfigSync();
    expect(config).toHaveCreatedCdkTemplates({ baseDir: temp.dir });
    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: awsAcceleratorConfigBucketName(config),
      Key: config.awsAcceleratorConfigDeploymentArtifactPath,
      Body: getAcceleratorConfigZip(config),
    });
    expect(customizationsPublishCdkAssetsSpy).toHaveBeenCalled();
  });
});

function getAcceleratorConfigZip(config: Config) {
  const zipPath = path.join(
    temp.dir,
    `${config.awsAcceleratorConfigOutPath}.zip`,
  );
  return fs.readFileSync(zipPath);
}
