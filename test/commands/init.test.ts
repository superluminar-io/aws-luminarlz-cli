import * as fs from 'fs';
import * as path from 'path';
import { OrganizationsClient, DescribeOrganizationCommand, ListRootsCommand } from '@aws-sdk/client-organizations';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SSOAdminClient, ListInstancesCommand } from '@aws-sdk/client-sso-admin';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Cli } from 'clipanion';
import { Init } from '../../src/commands/init';
import {
  AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
} from '../../src/config';
import { TestProjectDirectory } from '../../src/test-helper/test-project-directory';

describe('Init Command', () => {
  const testProjectDirectory = new TestProjectDirectory();

  // Mock AWS clients
  const stsMock = mockClient(STSClient);
  const orgMock = mockClient(OrganizationsClient);
  const ssoMock = mockClient(SSOAdminClient);
  const ssmMock = mockClient(SSMClient);

  beforeEach(() => {
    testProjectDirectory.initAndChangeToTempDirectory();

    // Reset mocks
    jest.clearAllMocks();
    stsMock.reset();
    orgMock.reset();
    ssoMock.reset();
    ssmMock.reset();

    // Setup AWS mock responses
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

  afterAll(() => {
    testProjectDirectory.changeToOriginalAndCleanUpTempDirectory();
  });

  it('should initialize a project with the specified blueprint and create a config.ts with expected content', async () => {
    // Create CLI instance with Init command
    const cli = new Cli();
    cli.register(Init);

    // Define test params
    const region = 'us-east-1';
    const email = 'test@example.com';

    // Run the command
    const exitCode = await cli.run([
      'init',
      '--region', region,
      '--accounts-root-email', email,
    ]);

    // Verify successful execution
    expect(exitCode).toBe(0);

    const configPath = path.join(testProjectDirectory.directory, 'config.ts');
    expect(fs.existsSync(configPath)).toBe(true);

    const configContent = fs.readFileSync(configPath, 'utf8');

    // Assert constants rendered into config.ts
    expect(configContent).toContain("export const AWS_ACCELERATOR_VERSION = '1.12.2'");
    expect(configContent).toContain("export const MANAGEMENT_ACCOUNT_ID = '123456789012'");
    expect(configContent).toContain("export const ORGANIZATION_ID = 'o-abcdef1234'");
    expect(configContent).toContain("export const ROOT_OU_ID = 'r-abcd1234'");
    expect(configContent).toContain("export const AWS_ACCOUNTS_ROOT_EMAIL = 'test@example.com'");
    expect(configContent).toContain("export const HOME_REGION = 'us-east-1'");
  });
});