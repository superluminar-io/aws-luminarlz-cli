import * as fs from 'fs';
import * as path from 'path';
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

  beforeEach(() => {
    temp = useTempDir();

    jest.clearAllMocks();
    stsMock.reset();
    orgMock.reset();
    ssoMock.reset();
    ssmMock.reset();

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

    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
        Value: TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
        Type: 'String',
      },
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
});
