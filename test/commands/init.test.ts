import * as fs from 'fs';
import os from 'node:os';
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

describe('Init Command', () => {
  // Mock AWS clients
  const stsMock = mockClient(STSClient);
  const orgMock = mockClient(OrganizationsClient);
  const ssoMock = mockClient(SSOAdminClient);
  const ssmMock = mockClient(SSMClient);

  // Save original stdout/stderr and console methods
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let stdoutOutput = '';
  let stderrOutput = '';

  const originalCwd = process.cwd();
  let testProjectDirectory = '';

  beforeAll(() => {
    // Create a temporary directory for the test project
    testProjectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aws-luminarlz-cli-test-'));

    // Change working directory for test
    process.chdir(testProjectDirectory);

    // Mock stdout/stderr to capture output
    process.stdout.write = jest.fn((chunk) => {
      stdoutOutput += chunk.toString();
      return true;
    });
    process.stderr.write = jest.fn((chunk) => {
      stderrOutput += chunk.toString();
      return true;
    });
  });

  afterAll(() => {
    // Restore original working directory
    process.chdir(originalCwd);

    // Restore stdout/stderr
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  });

  beforeEach(() => {
    // Reset mocks and output capture
    jest.clearAllMocks();
    stsMock.reset();
    orgMock.reset();
    ssoMock.reset();
    ssmMock.reset();
    stdoutOutput = '';
    stderrOutput = '';

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

  it('should initialize a project with the specified blueprint', async () => {
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
    expect(stdoutOutput).toContain('AWS management account ID: 123456789012');
    expect(stdoutOutput).toContain('AWS Organizations organization ID: o-abcdef1234');
    expect(stdoutOutput).toContain('AWS accounts root email address: test@example.com');
    expect(stdoutOutput).toContain('Landing Zone Accelerator on AWS version: 1.12.2');
    expect(stdoutOutput).toContain('AWS home region: us-east-1');
    expect(stdoutOutput).toContain('Done. ✅');
    expect(fs.existsSync(path.join(testProjectDirectory, 'config.ts'))).toBe(true);
  });
});