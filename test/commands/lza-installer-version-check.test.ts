import { CloudTrailClient, DescribeTrailsCommand } from '@aws-sdk/client-cloudtrail';
import { DescribeOrganizationCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Init } from '../../src/commands/init';
import { LzaInstallerVersionCheck } from '../../src/commands/lza-installer-version-check';
import { AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME } from '../../src/config';
import * as execModule from '../../src/core/util/exec';
import {
  TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
  TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_3,
  TEST_ACCOUNT_ID,
  TEST_EMAIL,
  TEST_REGION, TEST_USER_ID, TEST_ORGANIZATION_ID, TEST_ROOT_ID,
} from '../constants';
import { CliError, createCliFor, runCli } from '../test-helper/cli';
import { useTempDir } from '../test-helper/use-temp-dir';

let temp: ReturnType<typeof useTempDir>;
/**
 * Integration-style tests for `lza installer-version check`.
 * We only mock AWS SDK client calls and keep filesystem real.
 */
describe('LZA Installer Version - check command', () => {

  const ssmMock = mockClient(SSMClient);
  const stsMock = mockClient(STSClient);
  const organizationsMock = mockClient(OrganizationsClient);
  const ssoAdminMock = mockClient(SSOAdminClient);
  const cloudTrailMock = mockClient(CloudTrailClient);
  const FINALIZE_VERSION_PARAMETER_NAME = `/accelerator/AWSAccelerator-FinalizeStack-${TEST_ACCOUNT_ID}-${TEST_REGION}/version`;
  const mockVersionParameter = (name: string, value: string): void => {
    ssmMock.on(GetParameterCommand, { Name: name }).resolves({
      Parameter: {
        Name: name,
        Value: value,
        Type: 'String',
      },
    });
  };
  const mockFinalizeVersionForInit = (): void => {
    mockVersionParameter(FINALIZE_VERSION_PARAMETER_NAME, TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2);
  };
  const mockInstalledVersion = (value: string): void => {
    mockVersionParameter(AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME, value);
  };

  beforeEach(() => {
    temp = useTempDir();

    ssmMock.reset();
    stsMock.reset();
    organizationsMock.reset();
    ssoAdminMock.reset();
    cloudTrailMock.reset();
    jest.clearAllMocks();

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
        { Id: TEST_ROOT_ID, Arn: `arn:aws:organizations::${TEST_ACCOUNT_ID}:root/${TEST_ORGANIZATION_ID}/${TEST_ROOT_ID}`, Name: 'Root' },
      ],
    });
    ssoAdminMock.on(ListInstancesCommand).resolves({
      Instances: [
        { InstanceArn: 'arn:aws:sso:::instance/ssoins-example', IdentityStoreId: 'd-example123' },
      ],
    });
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: `arn:aws:logs:${TEST_REGION}:${TEST_ACCOUNT_ID}:log-group:aws-controltower/CloudTrailLogs-xyz`,
        },
      ],
    });
    mockFinalizeVersionForInit();
  });

  afterEach(() => {
    temp.restore();
  });

  it('should succeed after init when installed version matches configured version', async () => {
    mockInstalledVersion(TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2);

    const cli = createCliFor(Init, LzaInstallerVersionCheck);
    await runCli(cli, [
      'init',
      '--blueprint', 'foundational',
      '--accounts-root-email', TEST_EMAIL,
      '--region', TEST_REGION,
      '--force',
    ], temp);
    await execModule.executeCommand('npm install', { cwd: temp.directory });
    ssmMock.reset();
    mockInstalledVersion(TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2);
    await runCli(cli, ['lza', 'installer-version', 'check'], temp);

    expect(ssmMock).toHaveReceivedCommandTimes(GetParameterCommand, 1);
    expect(ssmMock).toHaveReceivedCommandWith(GetParameterCommand, {
      Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
    });
  });

  it('should fail after init when installed version does not match configured version', async () => {
    mockInstalledVersion(TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2);
    const cli = createCliFor(Init, LzaInstallerVersionCheck);

    await runCli(cli, [
      'init',
      '--blueprint', 'foundational',
      '--accounts-root-email', TEST_EMAIL,
      '--region', TEST_REGION,
      '--force',
    ], temp);
    await execModule.executeCommand('npm install', { cwd: temp.directory });
    ssmMock.reset();
    mockInstalledVersion(TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_3);
    const result = runCli(cli, ['lza', 'installer-version', 'check'], temp);

    await expect(result).rejects.toThrow(CliError);

    expect(ssmMock).toHaveReceivedCommandTimes(GetParameterCommand, 1);
    expect(ssmMock).toHaveReceivedCommandWith(GetParameterCommand, {
      Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
    });
  });
});
