import { DescribeOrganizationCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Cli } from 'clipanion';
import { Init } from '../../src/commands/init';
import { LzaInstallerVersionCheck } from '../../src/commands/lza-installer-version-check';
import { AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME } from '../../src/config';
import * as execModule from '../../src/core/util/exec';
import { TestProjectDirectory } from '../../src/test-helper/test-project-directory';

/**
 * Integration-style tests for `lza installer-version check`.
 * We only mock AWS SDK client calls and keep filesystem real.
 */
describe('LZA Installer Version - check command', () => {
  const testProjectDirectory = new TestProjectDirectory();

  const ssmMock = mockClient(SSMClient);
  const stsMock = mockClient(STSClient);
  const organizationsMock = mockClient(OrganizationsClient);
  const ssoAdminMock = mockClient(SSOAdminClient);

  beforeEach(() => {
    testProjectDirectory.initAndChangeToTempDirectory();

    ssmMock.reset();
    stsMock.reset();
    organizationsMock.reset();
    ssoAdminMock.reset();
    jest.clearAllMocks();

    // Common mocks needed by init
    // STS GetCallerIdentity
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:role/Admin',
      UserId: 'AROAEXAMPLE123',
    });
    // Organizations
    organizationsMock.on(DescribeOrganizationCommand).resolves({
      Organization: {
        Id: 'o-exampleorg',
        Arn: 'arn:aws:organizations::123456789012:organization/o-exampleorg',
        MasterAccountId: '123456789012',
      },
    });
    organizationsMock.on(ListRootsCommand).resolves({
      Roots: [
        { Id: 'r-exampleroot', Arn: 'arn:aws:organizations::123456789012:root/o-exampleorg/r-exampleroot', Name: 'Root' },
      ],
    });
    // SSO Admin
    ssoAdminMock.on(ListInstancesCommand).resolves({
      Instances: [
        { InstanceArn: 'arn:aws:sso:::instance/ssoins-example', IdentityStoreId: 'd-example123' },
      ],
    });
  });

  afterEach(() => {
    testProjectDirectory.changeToOriginalAndCleanUpTempDirectory();
  });

  it('should succeed after init when installed version matches configured version', async () => {
    // Arrange SSM mock to return the configured version
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
        Value: '1.12.2',
        Type: 'String',
      },
    });

    // Run init to generate config.ts
    const initCli = new Cli();
    initCli.register(Init);
    const initExitCode = await initCli.run([
      'init',
      '--blueprint', 'foundational',
      '--accounts-root-email', 'test@example.com',
      '--region', 'us-east-1',
      '--force',
    ]);
    expect(initExitCode).toBe(0);

    // Install dependencies after initialization
    await execModule.executeCommand('npm install', { cwd: testProjectDirectory.directory });

    const cli = new Cli();
    cli.register(LzaInstallerVersionCheck);

    // Act
    const exitCode = await cli.run(['lza', 'installer-version', 'check']);

    // Assert
    expect(exitCode).toBe(0);

    const calls = ssmMock.commandCalls(GetParameterCommand);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[calls.length - 1].args[0].input.Name).toBe(
      AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
    );
  }, 120 * 1000);

  it('should fail after init when installed version does not match configured version', async () => {
    // First SSM call (during init) returns 1.12.2, then check returns 1.12.3
    ssmMock.on(GetParameterCommand)
      .resolvesOnce({
        Parameter: {
          Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
          Value: '1.12.2',
          Type: 'String',
        },
      })
      .resolves({
        Parameter: {
          Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
          Value: '1.12.3',
          Type: 'String',
        },
      });

    // Run init to generate config.ts with 1.12.2
    const initCli = new Cli();
    initCli.register(Init);
    const initExitCode = await initCli.run([
      'init',
      '--blueprint', 'foundational',
      '--accounts-root-email', 'test@example.com',
      '--region', 'us-east-1',
      '--force',
    ]);
    expect(initExitCode).toBe(0);

    // Install dependencies after initialization
    await execModule.executeCommand('npm install', { cwd: testProjectDirectory.directory });

    const cli = new Cli();
    cli.register(LzaInstallerVersionCheck);

    // Act
    const exitCode = await cli.run(['lza', 'installer-version', 'check']);

    // Assert: non-zero exit code on version mismatch
    expect(exitCode).toBe(1);

    const calls = ssmMock.commandCalls(GetParameterCommand);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[calls.length - 1].args[0].input.Name).toBe(
      AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
    );
  }, 120 * 1000);
});
