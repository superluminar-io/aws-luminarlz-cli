import * as fs from 'fs';
import * as path from 'path';
import { CloudTrailClient, DescribeTrailsCommand } from '@aws-sdk/client-cloudtrail';
import { OrganizationsClient, DescribeOrganizationCommand, ListRootsCommand } from '@aws-sdk/client-organizations';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SSOAdminClient, ListInstancesCommand } from '@aws-sdk/client-sso-admin';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Init } from '../../src/commands/init';
import {
  AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
} from '../../src/config';
import {
  TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
  TEST_ACCOUNT_ID,
  TEST_EMAIL,
  TEST_REGION,
  TEST_USER_ID, TEST_ORGANIZATION_ID, TEST_ROOT_ID, TEST_MASTER_EMAIL,
} from '../constants';
import { runCli, createCliFor } from '../test-helper/cli';
import { useTempDir } from '../test-helper/use-temp-dir';

let temp: ReturnType<typeof useTempDir>;
describe('Init Command', () => {
  const stsMock = mockClient(STSClient);
  const orgMock = mockClient(OrganizationsClient);
  const ssoMock = mockClient(SSOAdminClient);
  const ssmMock = mockClient(SSMClient);
  const cloudTrailMock = mockClient(CloudTrailClient);
  const LZA_PREFIX_PARAMETER_NAME = '/accelerator/lza-prefix';
  const FINALIZE_VERSION_PARAMETER_NAME = `/accelerator/AWSAccelerator-FinalizeStack-${TEST_ACCOUNT_ID}-${TEST_REGION}/version`;
  const EU_HOME_REGION = 'eu-central-1';
  const EU_FINALIZE_PARAMETER_NAME = `/accelerator/AWSAccelerator-FinalizeStack-${TEST_ACCOUNT_ID}-${EU_HOME_REGION}/version`;
  const US_GOV_HOME_REGION = 'us-gov-east-1';
  const US_GOV_FINALIZE_PARAMETER_NAME = `/accelerator/AWSAccelerator-FinalizeStack-${TEST_ACCOUNT_ID}-us-gov-west-1/version`;
  const CN_HOME_REGION = 'cn-north-1';
  const CN_FINALIZE_PARAMETER_NAME = `/accelerator/AWSAccelerator-FinalizeStack-${TEST_ACCOUNT_ID}-cn-northwest-1/version`;
  const US_GOV_HOME_FINALIZE_PARAMETER_NAME = `/accelerator/AWSAccelerator-FinalizeStack-${TEST_ACCOUNT_ID}-${US_GOV_HOME_REGION}/version`;
  const CN_HOME_FINALIZE_PARAMETER_NAME = `/accelerator/AWSAccelerator-FinalizeStack-${TEST_ACCOUNT_ID}-${CN_HOME_REGION}/version`;
  const FINALIZE_PARAMETER_VALUE = TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2;

  const mockLzaPrefixParameter = () => {
    ssmMock.on(GetParameterCommand, {
      Name: LZA_PREFIX_PARAMETER_NAME,
    }).resolves({
      Parameter: {
        Name: LZA_PREFIX_PARAMETER_NAME,
        Value: 'AWSAccelerator',
        Type: 'String',
      },
    });
  };

  const mockInstallerVersionParameter = () => {
    ssmMock.on(GetParameterCommand, {
      Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
    }).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
        Value: TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
        Type: 'String',
      },
    });
  };

  const mockFinalizeVersionParameter = (parameterName: string, value: string) => {
    ssmMock.on(GetParameterCommand, {
      Name: parameterName,
    }).resolves({
      Parameter: {
        Name: parameterName,
        Value: value,
        Type: 'String',
      },
    });
  };

  const mockFinalizeNotFound = (parameterName: string) => {
    ssmMock.on(GetParameterCommand, {
      Name: parameterName,
    }).rejects(new Error('ParameterNotFound'));
  };

  const resetSsmInitBase = () => {
    ssmMock.reset();
    mockLzaPrefixParameter();
    mockInstallerVersionParameter();
  };

  const runInit = (region: string) => {
    const cli = createCliFor(Init);
    return runCli(cli, [
      'init',
      '--region', region,
      '--accounts-root-email', TEST_EMAIL,
    ], temp);
  };

  beforeEach(() => {
    temp = useTempDir();

    jest.clearAllMocks();
    stsMock.reset();
    orgMock.reset();
    ssoMock.reset();
    ssmMock.reset();
    cloudTrailMock.reset();

    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: TEST_ACCOUNT_ID,
      Arn: `arn:aws:iam::${TEST_ACCOUNT_ID}:user/test-user`,
      UserId: TEST_USER_ID,
    });

    orgMock.on(DescribeOrganizationCommand).resolves({
      Organization: {
        Id: TEST_ORGANIZATION_ID,
        Arn: `arn:aws:organizations::${TEST_ACCOUNT_ID}:organization/${TEST_ORGANIZATION_ID}`,
        FeatureSet: 'ALL',
        MasterAccountArn: `arn:aws:organizations::${TEST_ACCOUNT_ID}:account/${TEST_ORGANIZATION_ID}/${TEST_ACCOUNT_ID}`,
        MasterAccountEmail: TEST_MASTER_EMAIL,
        MasterAccountId: TEST_ACCOUNT_ID,
      },
    });

    orgMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: TEST_ROOT_ID,
          Arn: `arn:aws:organizations::${TEST_ACCOUNT_ID}:root/${TEST_ORGANIZATION_ID}/${TEST_ROOT_ID}`,
          Name: 'Root',
          PolicyTypes: [],
        },
      ],
    });

    ssoMock.on(ListInstancesCommand).resolves({
      Instances: [
        {
          InstanceArn: 'arn:aws:sso:::instance/ssoins-12345678901234567',
          IdentityStoreId: 'd-12345678ab',
        },
      ],
    });

    mockLzaPrefixParameter();
    mockFinalizeVersionParameter(FINALIZE_VERSION_PARAMETER_NAME, FINALIZE_PARAMETER_VALUE);
    mockInstallerVersionParameter();
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: `arn:aws:logs:${TEST_REGION}:${TEST_ACCOUNT_ID}:log-group:aws-controltower/CloudTrailLogs-xyz`,
        },
      ],
    });
  });

  afterEach(() => {
    temp.restore();
  });


  it('should initialize a project with the specified blueprint and create a config.ts with expected content', async () => {
    const cli = createCliFor(Init);
    const region = TEST_REGION;
    const email = TEST_EMAIL;

    await runCli(cli, [
      'init',
      '--region', region,
      '--accounts-root-email', email,
    ], temp);

    const configPath = path.join(temp.directory, 'config.ts');
    const configContent = fs.readFileSync(configPath, 'utf8');
    expect(configContent).toMatchSnapshot();
  });

  it('should fail when finalize marker parameter is missing', async () => {
    mockFinalizeNotFound(FINALIZE_VERSION_PARAMETER_NAME);
    await expect(runInit(TEST_REGION)).rejects.toThrow();

    expect(fs.existsSync(path.join(temp.directory, 'config.ts'))).toBe(false);
  });

  it('should initialize when finalize marker exists only in global region for a non-global home region', async () => {
    resetSsmInitBase();
    mockFinalizeNotFound(EU_FINALIZE_PARAMETER_NAME);
    mockFinalizeVersionParameter(FINALIZE_VERSION_PARAMETER_NAME, FINALIZE_PARAMETER_VALUE);
    await runInit(EU_HOME_REGION);

    expect(fs.existsSync(path.join(temp.directory, 'config.ts'))).toBe(true);
  });

  it('should fail with both checked finalize parameter paths when marker is missing in home and global region', async () => {
    resetSsmInitBase();
    mockFinalizeNotFound(EU_FINALIZE_PARAMETER_NAME);
    mockFinalizeNotFound(FINALIZE_VERSION_PARAMETER_NAME);
    await expect(runInit(EU_HOME_REGION)).rejects.toThrow();
    expect(ssmMock).toHaveReceivedCommandTimes(GetParameterCommand, 3);
    expect(ssmMock).toHaveReceivedCommandWith(GetParameterCommand, {
      Name: EU_FINALIZE_PARAMETER_NAME,
    });
    expect(ssmMock).toHaveReceivedCommandWith(GetParameterCommand, {
      Name: FINALIZE_VERSION_PARAMETER_NAME,
    });
  });

  it('should fail when finalize marker exists but has an empty value', async () => {
    resetSsmInitBase();
    mockFinalizeVersionParameter(FINALIZE_VERSION_PARAMETER_NAME, '');
    await expect(runInit(TEST_REGION)).rejects.toThrow();
    expect(ssmMock).toHaveReceivedCommandTimes(GetParameterCommand, 2);
    expect(ssmMock).toHaveReceivedCommandWith(GetParameterCommand, {
      Name: FINALIZE_VERSION_PARAMETER_NAME,
    });
  });

  it('should initialize when us-gov home region uses us-gov-west-1 finalize marker fallback', async () => {
    resetSsmInitBase();
    mockFinalizeNotFound(US_GOV_HOME_FINALIZE_PARAMETER_NAME);
    mockFinalizeVersionParameter(US_GOV_FINALIZE_PARAMETER_NAME, FINALIZE_PARAMETER_VALUE);
    await runInit(US_GOV_HOME_REGION);

    expect(fs.existsSync(path.join(temp.directory, 'config.ts'))).toBe(true);
  });

  it('should initialize when cn home region uses cn-northwest-1 finalize marker fallback', async () => {
    resetSsmInitBase();
    mockFinalizeNotFound(CN_HOME_FINALIZE_PARAMETER_NAME);
    mockFinalizeVersionParameter(CN_FINALIZE_PARAMETER_NAME, FINALIZE_PARAMETER_VALUE);
    await runInit(CN_HOME_REGION);

    expect(fs.existsSync(path.join(temp.directory, 'config.ts'))).toBe(true);
  });

});
