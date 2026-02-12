import fs from 'fs';
import path from 'path';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { CloudTrailClient, DescribeTrailsCommand } from '@aws-sdk/client-cloudtrail';
import { CodePipelineClient, ListPipelineExecutionsCommand } from '@aws-sdk/client-codepipeline';
import { GetAccountSettingsCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  DescribeOrganizationCommand,
  ListAccountsCommand,
  ListRootsCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Deploy } from '../../src/commands/deploy';
import { Init } from '../../src/commands/init';
import {
  AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
  AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
  awsAcceleratorConfigBucketName,
  awsAcceleratorInstallerRepositoryBranchName,
  toPendingConfigArtifactPath,
  Config,
  loadConfigSync,
} from '../../src/config';
import { getCheckoutPath } from '../../src/core/accelerator/repository/checkout';
import * as assets from '../../src/core/customizations/assets';
import {
  TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
  TEST_ACCOUNT_ID,
  TEST_EMAIL,
  TEST_REGION,
  TEST_USER_ID, TEST_ORGANIZATION_ID, TEST_ROOT_ID,
} from '../constants';
import { createCliFor, runCli } from '../test-helper/cli';
import { installLocalLuminarlzCliForTests } from '../test-helper/install-local-luminarlz-cli';
import { useTempDir } from '../test-helper/use-temp-dir';

let temp: ReturnType<typeof useTempDir>;
describe('Deploy command', () => {
  const ssmMock = mockClient(SSMClient);
  const stsMock = mockClient(STSClient);
  const organizationsMock = mockClient(OrganizationsClient);
  const ssoAdminMock = mockClient(SSOAdminClient);
  const s3Mock = mockClient(S3Client);
  const cloudTrailMock = mockClient(CloudTrailClient);
  const cloudFormationMock = mockClient(CloudFormationClient);
  const lambdaMock = mockClient(LambdaClient);
  const codePipelineMock = mockClient(CodePipelineClient);

  let customizationsPublishCdkAssetsSpy: jest.SpyInstance;
  const cli = createCliFor(Init, Deploy);

  beforeEach(() => {
    temp = useTempDir();

    ssmMock.reset();
    stsMock.reset();
    organizationsMock.reset();
    ssoAdminMock.reset();
    s3Mock.reset();
    cloudTrailMock.reset();
    cloudFormationMock.reset();
    lambdaMock.reset();
    codePipelineMock.reset();

    jest.clearAllMocks();

    customizationsPublishCdkAssetsSpy = jest.spyOn(assets, 'customizationsPublishCdkAssets').mockResolvedValue();

    ssmMock.on(GetParameterCommand, {
      Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
    }).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
        Value: TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
        Type: 'String',
      },
    });
    ssmMock.on(GetParameterCommand, {
      Name: AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
    }).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
        Value: 'true',
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
    organizationsMock.on(ListAccountsCommand).resolves({
      Accounts: [
        {
          Id: TEST_ACCOUNT_ID,
          Status: 'ACTIVE',
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

    lambdaMock.on(GetAccountSettingsCommand).resolves({
      AccountLimit: {
        ConcurrentExecutions: 1000,
      },
    });

    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: `arn:aws:logs:${TEST_REGION}:${TEST_ACCOUNT_ID}:log-group:aws-controltower/CloudTrailLogs-xyz`,
        },
      ],
    });

    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [{
        StackName: 'AWSAccelerator-InstallerStack',
        CreationTime: new Date(),
        StackStatus: 'CREATE_COMPLETE',
      }],
    });
    s3Mock.on(HeadBucketCommand).resolves({});
    codePipelineMock.on(ListPipelineExecutionsCommand).resolves({
      pipelineExecutionSummaries: [],
    });
  });

  afterEach(() => {
    temp.restore();
  });

  it('should deploy after initializing a project with the specified blueprint (skip doctor)', async () => {
    await runCli(cli, [
      'init',
      '--accounts-root-email', TEST_EMAIL,
      '--region', TEST_REGION,
    ], temp);
    await installLocalLuminarlzCliForTests(temp);
    await runCli(cli, ['deploy', '--skip-doctor'], temp);

    const config = loadConfigSync();
    expect(config).toHaveCreatedCdkTemplates({ baseDir: temp.directory });
    expect(getSecurityConfigContents()).toContain('aws-controltower/CloudTrailLogs-xyz');
    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: awsAcceleratorConfigBucketName(config),
      Key: config.awsAcceleratorConfigDeploymentArtifactPath,
      Body: getAcceleratorConfigZip(config),
    });
    expect(customizationsPublishCdkAssetsSpy).toHaveBeenCalled();
  });

  it('should deploy when doctor succeeds', async () => {
    await runCli(cli, [
      'init',
      '--accounts-root-email', TEST_EMAIL,
      '--region', TEST_REGION,
    ], temp);
    await installLocalLuminarlzCliForTests(temp);

    const config = loadConfigSync();
    const checkoutPath = getCheckoutPath();
    fs.mkdirSync(path.join(checkoutPath, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(checkoutPath, '.git', 'HEAD'),
      `ref: refs/heads/${awsAcceleratorInstallerRepositoryBranchName(config)}`,
    );

    await runCli(cli, ['deploy'], temp);

    expect(config).toHaveCreatedCdkTemplates({ baseDir: temp.directory });
    expect(getSecurityConfigContents()).toContain('aws-controltower/CloudTrailLogs-xyz');
    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: awsAcceleratorConfigBucketName(config),
      Key: config.awsAcceleratorConfigDeploymentArtifactPath,
      Body: getAcceleratorConfigZip(config),
    });
    expect(customizationsPublishCdkAssetsSpy).toHaveBeenCalled();
  });

  it('should abort when doctor fails', async () => {
    await runCli(cli, [
      'init',
      '--accounts-root-email', TEST_EMAIL,
      '--region', TEST_REGION,
    ], temp);
    await installLocalLuminarlzCliForTests(temp);

    const config = loadConfigSync();
    const checkoutPath = getCheckoutPath();
    fs.mkdirSync(path.join(checkoutPath, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(checkoutPath, '.git', 'HEAD'),
      `ref: refs/heads/${awsAcceleratorInstallerRepositoryBranchName(config)}`,
    );

    s3Mock.on(HeadBucketCommand).rejects(new Error('NotFound'));

    const result = await runCli(cli, ['deploy'], temp);

    expect(result).toBe(0);
    expect(customizationsPublishCdkAssetsSpy).not.toHaveBeenCalled();
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 0);
  });

  it('should upload a pending config artifact when a pipeline execution is already in progress', async () => {
    await runCli(cli, [
      'init',
      '--accounts-root-email', TEST_EMAIL,
      '--region', TEST_REGION,
    ], temp);
    await installLocalLuminarlzCliForTests(temp);

    codePipelineMock.on(ListPipelineExecutionsCommand).resolves({
      pipelineExecutionSummaries: [
        {
          pipelineExecutionId: 'execution-123',
          status: 'InProgress',
        },
      ],
    });

    const result = await runCli(cli, ['deploy', '--skip-doctor'], temp);
    const config = loadConfigSync();

    expect(result).toBe(0);
    expect(customizationsPublishCdkAssetsSpy).toHaveBeenCalled();
    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: awsAcceleratorConfigBucketName(config),
      Key: toPendingConfigArtifactPath(config.awsAcceleratorConfigDeploymentArtifactPath),
      Body: getAcceleratorConfigZip(config),
    });
  });

  it('should abort when a pipeline execution is in progress and pending flow is disabled', async () => {
    await runCli(cli, [
      'init',
      '--accounts-root-email', TEST_EMAIL,
      '--region', TEST_REGION,
    ], temp);
    await installLocalLuminarlzCliForTests(temp);

    codePipelineMock.on(ListPipelineExecutionsCommand).resolves({
      pipelineExecutionSummaries: [
        {
          pipelineExecutionId: 'execution-123',
          status: 'InProgress',
        },
      ],
    });
    ssmMock.on(GetParameterCommand, {
      Name: AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
    }).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
        Value: 'false',
        Type: 'String',
      },
    });

    const result = await runCli(cli, ['deploy', '--skip-doctor'], temp);

    expect(result).toBe(0);
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 0);
  });
});

function getAcceleratorConfigZip(config: Config) {
  const zipPath = path.join(
    temp.directory,
    `${config.awsAcceleratorConfigOutPath}.zip`,
  );
  return fs.readFileSync(zipPath);
}

function getSecurityConfigContents() {
  return fs.readFileSync(path.join(temp.directory, 'aws-accelerator-config.out', 'security-config.yaml'), 'utf8');
}
