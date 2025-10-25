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
import { runCli, createCliFor } from '../../src/test-helper/cli';
import { useTempDir } from '../../src/test-helper/use-temp-dir';

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
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:user/test-user',
      UserId: 'AIDATEST123456',
    });

    orgMock.on(DescribeOrganizationCommand).resolves({
      Organization: {
        Id: 'o-abcdef1234',
        Arn: 'arn:aws:organizations::123456789012:organization/o-abcdef1234',
        FeatureSet: 'ALL',
        MasterAccountArn: 'arn:aws:organizations::123456789012:account/o-abcdef1234/123456789012',
        MasterAccountEmail: 'master@example.com',
        MasterAccountId: '123456789012',
      },
    });

    orgMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: 'r-abcd1234',
          Arn: 'arn:aws:organizations::123456789012:root/o-abcdef1234/r-abcd1234',
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
        Value: '1.12.2',
        Type: 'String',
      },
    });
  });

  afterEach(() => {
    temp.restore();
  });


  it('should initialize a project with the specified blueprint and create a config.ts with expected content', async () => {
    const cli = createCliFor(Init);
    const region = 'us-east-1';
    const email = 'test@example.com';

    await runCli(cli, [
      'init',
      '--region', region,
      '--accounts-root-email', email,
    ], temp);

    const configPath = path.join(temp.dir, 'config.ts');
    const configContent = fs.readFileSync(configPath, 'utf8');
    expect(configContent).toMatchSnapshot();
  });
});