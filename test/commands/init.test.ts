import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DescribeOrganizationCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Init } from '../../src/commands/init';

// Mock executeCommand
jest.mock('../../src/core/util/exec', () => ({
  executeCommand: jest.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

describe('Init Command', () => {
  // Mock AWS SDK clients
  const stsMock = mockClient(STSClient);
  const organizationsMock = mockClient(OrganizationsClient);
  const ssoAdminMock = mockClient(SSOAdminClient);
  const ssmMock = mockClient(SSMClient);

  // Setup temporary directory
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Reset mocks
    stsMock.reset();
    organizationsMock.reset();
    ssoAdminMock.reset();
    ssmMock.reset();
    jest.clearAllMocks();

    // Setup AWS SDK mock responses
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '123456789012',
    });

    organizationsMock.on(DescribeOrganizationCommand).resolves({
      Organization: {
        Id: 'o-abcdef123456',
      },
    });

    organizationsMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: 'r-abcdef',
        },
      ],
    });

    ssoAdminMock.on(ListInstancesCommand).resolves({
      Instances: [
        {
          IdentityStoreId: 'd-abcdef123456',
        },
      ],
    });

    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: '1.5.0',
      },
    });

    // Create temporary directory and change to it
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luminarlz-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    // Change back to original directory
    process.chdir(originalCwd);

    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('should initialize a project with the foundational blueprint', async () => {
    // Create an instance of the Init command
    const init = new Init();
    init.blueprint = 'foundational';
    init.accountsRootEmail = 'test@example.com';
    init.region = 'us-east-1';
    init.force = true;

    // Execute the command
    await init.execute();

    // Verify AWS SDK calls
    expect(stsMock.calls()).toHaveLength(1);
    expect(stsMock.calls()[0].args[0].input).toEqual({});

    expect(organizationsMock.calls()).toHaveLength(2);
    expect(organizationsMock.calls()[0].args[0].input).toEqual({});
    expect(organizationsMock.calls()[1].args[0].input).toEqual({});

    expect(ssoAdminMock.calls()).toHaveLength(1);
    expect(ssoAdminMock.calls()[0].args[0].input).toEqual({});

    expect(ssmMock.calls()).toHaveLength(1);
    expect(ssmMock.calls()[0].args[0].input).toEqual({
      Name: '/accelerator/AWSAccelerator-InstallerStack/version',
    });

    // Verify file creation
    const configFile = path.join(tempDir, 'config.ts');
    expect(fs.existsSync(configFile)).toBe(true);
    const ssoSignInRunbookFile = path.join(tempDir, 'docs/runbooks/using-sso-to-sign-in-to-aws-accounts.md');
    expect(fs.existsSync(ssoSignInRunbookFile)).toBe(true);

    // Verify file content
    const configContent = fs.readFileSync(configFile, 'utf-8');
    // Check that values appear in the right context
    expect(configContent).toContain("export const MANAGEMENT_ACCOUNT_ID = '123456789012';");
    expect(configContent).toContain("export const ORGANIZATION_ID = 'o-abcdef123456';");
    expect(configContent).toContain("export const ROOT_OU_ID = 'r-abcdef';");
    expect(configContent).toContain("export const AWS_ACCOUNTS_ROOT_EMAIL = 'test@example.com';");
    expect(configContent).toContain("export const HOME_REGION = 'us-east-1';");

    const ssoSignInRunbookContent = fs.readFileSync(ssoSignInRunbookFile, 'utf-8');
    // Check that the identity store ID appears in the right context (SSO sign-in URL)
    expect(ssoSignInRunbookContent).toContain('https://d-abcdef123456.awsapps.com/start');
  });
});
