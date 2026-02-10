import * as fs from 'node:fs';
import * as path from 'node:path';
import { DescribeStacksCommand, CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { GetAccountSettingsCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { ListAccountsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { CheckStatus, runDoctor } from '../../src/core/doctor/doctor';
import {
  TEST_ACCOUNT_ID,
  TEST_REGION,
  TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
  TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_3,
} from '../constants';
import { useTempDir } from '../test-helper/use-temp-dir';

let temp: ReturnType<typeof useTempDir>;
type SetupOverrides = Partial<typeof baseSetup>;

const stsMock = mockClient(STSClient);
const ssmMock = mockClient(SSMClient);
const cloudFormationMock = mockClient(CloudFormationClient);
const s3Mock = mockClient(S3Client);
const lambdaMock = mockClient(LambdaClient);
const organizationsMock = mockClient(OrganizationsClient);

const managementAccountId = TEST_ACCOUNT_ID;
const homeRegion = TEST_REGION;
const enabledRegions = [TEST_REGION, 'eu-central-1'];
const configBucket = `aws-accelerator-config-${managementAccountId}-${homeRegion}`;
const cdkBucketHome = `cdk-accel-assets-${managementAccountId}-${homeRegion}`;
const cdkBucketEu = `cdk-accel-assets-${managementAccountId}-eu-central-1`;

const configuredInstallerVersion = TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2;
const mismatchedInstallerVersion = TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_3;

const baseSetup = {
  accountId: managementAccountId,
  installerVersion: configuredInstallerVersion,
  configBucketOk: true,
  cdkBucketHomeOk: true,
  cdkBucketEuOk: true,
  checkoutBranch: `release/v${configuredInstallerVersion}`,
  checkoutMissing: false,
  installerStackMissing: false,
  lambdaConcurrency: 1000,
};

describe('Doctor preflight checks', () => {
  beforeEach(() => {
    temp = useTempDir();

    stsMock.reset();
    ssmMock.reset();
    cloudFormationMock.reset();
    s3Mock.reset();
    lambdaMock.reset();
    organizationsMock.reset();
  });

  afterEach(() => {
    temp.restore();
  });

  it('should pass when all checks are satisfied', async () => {
    setupDoctor();

    const summary = await runDoctor();

    expect(summary.hasFailures).toBe(false);
    expect(getCheckStatus(summary, 'aws-identity')).toBe(CheckStatus.OK);
    expect(getCheckStatus(summary, 'installer-version')).toBe(CheckStatus.OK);
    expect(getCheckStatus(summary, 'installer-stack')).toBe(CheckStatus.OK);
    expect(getCheckStatus(summary, 'config-bucket')).toBe(CheckStatus.OK);
    expect(getCheckStatus(summary, 'cdk-assets-buckets')).toBe(CheckStatus.OK);
    expect(getCheckStatus(summary, 'lambda-concurrency')).toBe(CheckStatus.OK);
    expect(getCheckStatus(summary, 'lza-checkout')).toBe(CheckStatus.OK);
  });

  it('should fail when running in a non-management account', async () => {
    const nonManagementAccountId = '000000000000';
    setupDoctor({ accountId: nonManagementAccountId });

    const summary = await runDoctor();

    expect(summary.hasFailures).toBe(true);
    expect(getCheckStatus(summary, 'aws-identity')).toBe(CheckStatus.FAIL);
  });

  it('should fail when installer version mismatches config', async () => {
    setupDoctor({ installerVersion: mismatchedInstallerVersion });

    const summary = await runDoctor();

    expect(summary.hasFailures).toBe(true);
    expect(getCheckStatus(summary, 'installer-version')).toBe(CheckStatus.FAIL);
  });

  it('should fail when installer stack is missing', async () => {
    setupDoctor({ installerStackMissing: true });

    const summary = await runDoctor();

    expect(summary.hasFailures).toBe(true);
    expect(getCheckStatus(summary, 'installer-stack')).toBe(CheckStatus.FAIL);
  });

  it('should fail when config bucket is missing', async () => {
    setupDoctor({ configBucketOk: false });

    const summary = await runDoctor();

    expect(summary.hasFailures).toBe(true);
    expect(getCheckStatus(summary, 'config-bucket')).toBe(CheckStatus.FAIL);
  });

  it('should fail when a CDK assets bucket is missing', async () => {
    setupDoctor({ cdkBucketEuOk: false });

    const summary = await runDoctor();

    expect(summary.hasFailures).toBe(true);
    expect(getCheckStatus(summary, 'cdk-assets-buckets')).toBe(CheckStatus.FAIL);
  });

  it('should fail when the LZA checkout is missing', async () => {
    setupDoctor({ checkoutMissing: true });

    const summary = await runDoctor();

    expect(summary.hasFailures).toBe(true);
    expect(getCheckStatus(summary, 'lza-checkout')).toBe(CheckStatus.FAIL);
  });

  it('should fail when the LZA checkout branch mismatches', async () => {
    const mismatchedCheckoutBranch = 'release/v1.12.1';
    setupDoctor({ checkoutBranch: mismatchedCheckoutBranch });

    const summary = await runDoctor();

    expect(summary.hasFailures).toBe(true);
    expect(getCheckStatus(summary, 'lza-checkout')).toBe(CheckStatus.FAIL);
  });

  it('should fail when lambda concurrency is below minimum', async () => {
    setupDoctor({ lambdaConcurrency: 100 });

    const summary = await runDoctor();

    expect(summary.hasFailures).toBe(true);
    expect(getCheckStatus(summary, 'lambda-concurrency')).toBe(CheckStatus.FAIL);
  });
});

function setupDoctor(overrides: SetupOverrides = {}) {
  const setup = { ...baseSetup, ...overrides };

  writeConfig(TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2, homeRegion, enabledRegions);

  if (!setup.checkoutMissing) {
    writeCheckoutBranch(setup.checkoutBranch);
  }

  stsMock.on(GetCallerIdentityCommand).resolves({ Account: setup.accountId });
  ssmMock.on(GetParameterCommand).resolves({
    Parameter: { Value: setup.installerVersion },
  });

  if (setup.installerStackMissing) {
    cloudFormationMock.on(DescribeStacksCommand).rejects(new Error('Stack does not exist'));
  } else {
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [{
        StackName: 'AWSAccelerator-InstallerStack',
        CreationTime: new Date(),
        StackStatus: 'CREATE_COMPLETE',
      }],
    });
  }

  mockS3Buckets({
    [configBucket]: setup.configBucketOk,
    [cdkBucketHome]: setup.cdkBucketHomeOk,
    [cdkBucketEu]: setup.cdkBucketEuOk,
  });

  lambdaMock.on(GetAccountSettingsCommand).resolves({
    AccountLimit: {
      ConcurrentExecutions: setup.lambdaConcurrency,
    },
  });

  organizationsMock.on(ListAccountsCommand).resolves({
    Accounts: [
      {
        Id: managementAccountId,
        Status: 'ACTIVE',
      },
    ],
  });
  stsMock.on(AssumeRoleCommand).rejects(new Error('Role missing'));
}

function writeConfig(version: string, region: string, regions: string[]) {
  const configTs = `
export const config = {
  awsAcceleratorConfigOutPath: 'aws-accelerator-config.out',
  awsAcceleratorConfigTemplates: 'templates',
  customizationPath: 'customizations',
  cdkOutPath: 'customizations/cdk.out',
  globalRegion: 'us-east-1',
  awsAcceleratorConfigBucketPattern: 'aws-accelerator-config-%s-%s',
  awsAcceleratorConfigDeploymentArtifactPath: 'zipped/aws-accelerator-config.zip',
  cdkAccelAssetsBucketNamePattern: 'cdk-accel-assets-%s-',
  awsAcceleratorPipelineName: 'AWSAccelerator-Pipeline',
  awsAcceleratorInstallerStackName: 'AWSAccelerator-InstallerStack',
  awsAcceleratorInstallerRepositoryBranchNamePrefix: 'release/v',
  awsAcceleratorInstallerStackTemplateUrlPattern: 'https://s3.amazonaws.com/solutions-reference/landing-zone-accelerator-on-aws/v%s/AWSAccelerator-InstallerStack.template',
  maxParallelCdkAssetManifestUploads: 200,
  minLambdaConcurrency: 1000,
  awsAcceleratorVersion: '${version}',
  environments: {},
  templates: [],
  managementAccountId: '${managementAccountId}',
  homeRegion: '${region}',
  enabledRegions: ${JSON.stringify(regions)},
};
`.trimStart();
  fs.writeFileSync(path.join(temp.directory, 'config.ts'), configTs);
}

function writeCheckoutBranch(branch: string) {
  const expected = `release/v${TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2}`;
  const checkoutDir = path.join(temp.directory, `.landing-zone-accelerator-on-aws-${expected.replace('/', '-')}`);
  fs.mkdirSync(path.join(checkoutDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(checkoutDir, '.git', 'HEAD'), `ref: refs/heads/${branch}`);
}

function mockS3Buckets(statusByBucket: Record<string, boolean>) {
  for (const [bucket, ok] of Object.entries(statusByBucket)) {
    if (ok) {
      s3Mock.on(HeadBucketCommand, { Bucket: bucket }).resolves({});
    } else {
      s3Mock.on(HeadBucketCommand, { Bucket: bucket }).rejects(new Error('NotFound'));
    }
  }
}

function getCheckStatus(summary: { results: { id: string; status: CheckStatus }[] }, id: string) {
  const match = summary.results.find((result) => result.id === id);
  if (!match) {
    throw new Error(`Missing check result for id: ${id}`);
  }
  return match.status;
}
