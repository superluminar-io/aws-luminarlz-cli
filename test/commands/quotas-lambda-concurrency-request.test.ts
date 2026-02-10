import fs from 'node:fs';
import path from 'node:path';
import { GetAccountSettingsCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  DescribeOrganizationCommand,
  ListAccountsCommand,
  ListRootsCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import {
  ListServiceQuotasCommand,
  ListServiceQuotasCommandOutput,
  ListRequestedServiceQuotaChangeHistoryCommand,
  RequestServiceQuotaIncreaseCommand,
  ServiceQuotasClient,
} from '@aws-sdk/client-service-quotas';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { QuotasLambdaConcurrencyRequest } from '../../src/commands/quotas-lambda-concurrency-request';
import { TEST_ACCOUNT_ID, TEST_REGION } from '../constants';
import { createCliFor } from '../test-helper/cli';
import { useTempDir } from '../test-helper/use-temp-dir';

let temp: ReturnType<typeof useTempDir>;
const cli = createCliFor(QuotasLambdaConcurrencyRequest);

const lambdaMock = mockClient(LambdaClient);
const organizationsMock = mockClient(OrganizationsClient);
const serviceQuotasMock = mockClient(ServiceQuotasClient);
const stsMock = mockClient(STSClient);
const ssoAdminMock = mockClient(SSOAdminClient);
const ssmMock = mockClient(SSMClient);

describe('Lambda concurrency quota request command', () => {
  beforeEach(() => {
    temp = useTempDir();
    lambdaMock.reset();
    organizationsMock.reset();
    serviceQuotasMock.reset();
    stsMock.reset();
    ssoAdminMock.reset();
    ssmMock.reset();

    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: TEST_ACCOUNT_ID,
      Arn: `arn:aws:iam::${TEST_ACCOUNT_ID}:role/Admin`,
      UserId: 'AROAEXAMPLE123',
    });
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: { Value: '1.14.2' },
    });
    organizationsMock.on(DescribeOrganizationCommand).resolves({
      Organization: { Id: 'o-abcdef1234' },
    });
    organizationsMock.on(ListRootsCommand).resolves({
      Roots: [{ Id: 'r-abcd1234' }],
    });
    ssoAdminMock.on(ListInstancesCommand).resolves({
      Instances: [
        { IdentityStoreId: 'd-example123' },
      ],
    });
  });

  afterEach(() => {
    temp.restore();
  });

  it('should submit quota requests when below minimum', async () => {
    writeConfig(temp.directory);

    organizationsMock.on(ListAccountsCommand).resolves({
      Accounts: [
        { Id: TEST_ACCOUNT_ID, Status: 'ACTIVE' },
      ],
    });
    lambdaMock.on(GetAccountSettingsCommand).resolves({
      AccountLimit: { ConcurrentExecutions: 10 },
    });
    serviceQuotasMock.on(ListServiceQuotasCommand).resolves({
      Quotas: [
        { QuotaName: 'Concurrent executions', QuotaCode: 'L-TEST1234' },
      ],
    } as ListServiceQuotasCommandOutput);
    serviceQuotasMock.on(ListRequestedServiceQuotaChangeHistoryCommand).resolves({
      RequestedQuotas: [],
    });
    serviceQuotasMock.on(RequestServiceQuotaIncreaseCommand).resolves({});
    stsMock.on(AssumeRoleCommand).rejects(new Error('Role missing'));

    await runCliCapture(cli, ['quotas', 'lambda-concurrency', 'request'], temp);

    expect(serviceQuotasMock).toHaveReceivedCommandWith(RequestServiceQuotaIncreaseCommand, {
      ServiceCode: 'lambda',
      QuotaCode: 'L-TEST1234',
      DesiredValue: 1000,
    });
  });

  it('should dry-run without submitting requests', async () => {
    writeConfig(temp.directory);

    organizationsMock.on(ListAccountsCommand).resolves({
      Accounts: [
        { Id: TEST_ACCOUNT_ID, Status: 'ACTIVE' },
      ],
    });
    lambdaMock.on(GetAccountSettingsCommand).resolves({
      AccountLimit: { ConcurrentExecutions: 10 },
    });
    serviceQuotasMock.on(ListServiceQuotasCommand).resolves({
      Quotas: [
        { QuotaName: 'Concurrent executions', QuotaCode: 'L-TEST1234' },
      ],
    } as ListServiceQuotasCommandOutput);
    serviceQuotasMock.on(ListRequestedServiceQuotaChangeHistoryCommand).resolves({
      RequestedQuotas: [],
    });
    stsMock.on(AssumeRoleCommand).rejects(new Error('Role missing'));

    await runCliCapture(cli, ['quotas', 'lambda-concurrency', 'request', '--dry-run'], temp);

    expect(serviceQuotasMock).toHaveReceivedCommandTimes(RequestServiceQuotaIncreaseCommand, 0);
  });
});

function writeConfig(baseDir: string) {
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
  awsAcceleratorVersion: '1.14.2',
  environments: {},
  templates: [],
  managementAccountId: '${TEST_ACCOUNT_ID}',
  homeRegion: '${TEST_REGION}',
  enabledRegions: ${JSON.stringify([TEST_REGION, 'eu-central-1'])},
};
`.trimStart();
  fs.writeFileSync(path.join(baseDir, 'config.ts'), configTs);
}

async function runCliCapture(cliInstance: ReturnType<typeof createCliFor>, argv: string[], tempDir: ReturnType<typeof useTempDir>) {
  const prevCwd = process.cwd();
  process.chdir(tempDir.directory);
  let output = '';
  const stream = {
    write(chunk: unknown) {
      output += String(chunk);
    },
  };
  const code = await (cliInstance as any).run(argv, {
    stdin: process.stdin,
    stdout: stream as NodeJS.WritableStream,
    stderr: stream as NodeJS.WritableStream,
    cwd: () => process.cwd(),
    env: process.env,
  });
  process.chdir(prevCwd);
  if (code !== 0) {
    throw new Error(`CLI exited with code ${code}\n${output}`);
  }
  return code;
}
