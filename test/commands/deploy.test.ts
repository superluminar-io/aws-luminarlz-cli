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
import {
  TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
  TEST_ACCOUNT_ID,
  TEST_EMAIL,
  TEST_REGION,
  TEST_USER_ID, TEST_ORGANIZATION_ID, TEST_ROOT_ID,
} from '../constants';
import { createCliFor, runCli } from '../test-helper/cli';
import { useTempDir } from '../test-helper/use-temp-dir';

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
        Value: TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
        Type: 'String',
      },
    });

    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: TEST_ACCOUNT_ID,
      Arn: `arn:aws:iam::${TEST_ACCOUNT_ID}:role/Admin`,
      UserId: TEST_USER_ID,
    });

    organizationsMock.on(DescribeOrganizationCommand).resolves({
      Organization: {
        Id: TEST_ORGANIZATION_ID,
        Arn: `arn:aws:organizations::${TEST_ACCOUNT_ID}:organization/${TEST_ORGANIZATION_ID}`,
        MasterAccountId: TEST_ACCOUNT_ID,
      },
    });

    organizationsMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: TEST_ROOT_ID,
          Arn: `arn:aws:organizations::${TEST_ACCOUNT_ID}:root/${TEST_ORGANIZATION_ID}/${TEST_ROOT_ID}`,
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
      '--accounts-root-email', TEST_EMAIL,
      '--region', TEST_REGION,
    ], temp);
    await executeCommand('npm install', { cwd: temp.directory });
    await runCli(cli, ['deploy'], temp);

    const config = loadConfigSync();
    expect(config).toHaveCreatedCdkTemplates({ baseDir: temp.directory });
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
    temp.directory,
    `${config.awsAcceleratorConfigOutPath}.zip`,
  );
  return fs.readFileSync(zipPath);
}
