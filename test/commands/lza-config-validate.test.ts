import fs from 'fs';
import path from 'path';
import { DescribeOrganizationCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Cli } from 'clipanion';
import { Init } from '../../src/commands/init';
import { LzaConfigValidate } from '../../src/commands/lza-config-validate';
import { AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME, LZA_SOURCE_PATH, loadConfigSync } from '../../src/config';
import { getCheckoutPath } from '../../src/core/accelerator/repository/checkout';
import * as execModule from '../../src/core/util/exec';
import { TestProjectDirectory } from '../../src/test-helper/test-project-directory';

describe('LZA Config Validate command', () => {
  const testProjectDirectory = new TestProjectDirectory();

  // Create mocks for AWS services (used during init rendering)
  const ssmMock = mockClient(SSMClient);
  const stsMock = mockClient(STSClient);
  const organizationsMock = mockClient(OrganizationsClient);
  const ssoAdminMock = mockClient(SSOAdminClient);

  let execSpy: jest.SpyInstance;
  const realExecute = execModule.executeCommand;

  beforeEach(() => {
    testProjectDirectory.initAndChangeToTempDirectory();

    // Clear and reset mocks before each test
    ssmMock.reset();
    stsMock.reset();
    organizationsMock.reset();
    ssoAdminMock.reset();
    jest.clearAllMocks();

    // Set up executeCommand spy with passthrough. Intercept only cloning and building of the LZA repo
    execSpy = jest.spyOn(execModule, 'executeCommand').mockImplementation(((command: any, opts: any) => {
      if (typeof command === 'string') {
        if (command.startsWith('git clone ')) {
          return Promise.resolve({ stdout: '', stderr: '' } as any) as any;
        }
        if (command.startsWith('yarn')) {
          return Promise.resolve({ stdout: '', stderr: '' } as any) as any;
        }
      }
      return (realExecute as any)(command, opts);
    }) as any);

    // Mock SSM parameter for AWS Accelerator version
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
        Value: '1.12.2',
        Type: 'String',
      },
    });

    // Mock STS GetCallerIdentity
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:role/Admin',
      UserId: 'AROAEXAMPLE123',
    });

    // Mock Organizations DescribeOrganization
    organizationsMock.on(DescribeOrganizationCommand).resolves({
      Organization: {
        Id: 'o-exampleorg',
        Arn: 'arn:aws:organizations::123456789012:organization/o-exampleorg',
        MasterAccountId: '123456789012',
      },
    });

    // Mock Organizations ListRoots
    organizationsMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: 'r-exampleroot',
          Arn: 'arn:aws:organizations::123456789012:root/o-exampleorg/r-exampleroot',
          Name: 'Root',
        },
      ],
    });

    // Mock SSO Admin ListInstances
    ssoAdminMock.on(ListInstancesCommand).resolves({
      Instances: [
        {
          InstanceArn: 'arn:aws:sso:::instance/ssoins-example',
          IdentityStoreId: 'd-example123',
        },
      ],
    });
  });

  afterAll(() => {
    testProjectDirectory.changeToOriginalAndCleanUpTempDirectory();
  });

  it('should synthesize and validate after initializing a project with the specified blueprint', async () => {
    // Run the init command to set up the project
    const initCli = new Cli();
    initCli.register(Init);
    const initExitCode = await initCli.run([
      'init',
      '--blueprint', 'foundational',
      '--accounts-root-email', 'test@example.com',
      '--region', 'us-east-1',
      '--force',
    ]);

    // Install dependencies after initialization
    await execModule.executeCommand('npm install', { cwd: testProjectDirectory.directory });

    // Verify init was successful
    expect(initExitCode).toBe(0);

    // Now create CLI instance with LzaConfigValidate command
    const validateCli = new Cli();
    validateCli.register(LzaConfigValidate);

    // Run the lza config validate command
    const validateExitCode = await validateCli.run(['lza', 'config', 'validate']);

    // Verify command was successful
    expect(validateExitCode).toBe(0);

    // Verify that the accelerator config output directory was created and contains files
    const config = loadConfigSync();
    const outPath = path.join(testProjectDirectory.directory, config.awsAcceleratorConfigOutPath);
    expect(fs.existsSync(outPath)).toBe(true);
    const outFiles = fs.readdirSync(outPath, { recursive: false });
    expect(outFiles.length).toBeGreaterThan(0);

    // Verify that cdk.out templates were copied into the output directory
    const cdkOutPath = path.join(outPath, config.cdkOutPath);
    expect(fs.existsSync(cdkOutPath)).toBe(true);
    const cdkFiles = fs
      .readdirSync(cdkOutPath, { recursive: true })
      .filter((f) => f.toString().endsWith('.template.json'));
    expect(cdkFiles.length).toBeGreaterThan(0);

    // Ensure executeCommand was called to run validate-config with correct parameters
    const expectedConfigDir = path.join(testProjectDirectory.directory, config.awsAcceleratorConfigOutPath);
    const expectedCwd = path.join(getCheckoutPath(), LZA_SOURCE_PATH);
    const validateCalls = execSpy.mock.calls.filter(([cmd]) => typeof cmd === 'string' && cmd.startsWith('yarn validate-config'));
    expect(validateCalls.length).toBe(1);
    expect(validateCalls[0][0]).toBe(`yarn validate-config ${expectedConfigDir}`);
    expect(validateCalls[0][1]?.cwd).toBe(expectedCwd);

    // Ensure executeCommand was called to clone the repository and then build it
    const cloneCalls = execSpy.mock.calls.filter(([cmd]) => typeof cmd === 'string' && cmd.startsWith('git clone '));
    expect(cloneCalls.length).toBe(1);

    const buildCalls = execSpy.mock.calls.filter(([cmd, opts]) => typeof cmd === 'string' && cmd.includes('yarn') && cmd.includes('build') && opts?.cwd === expectedCwd);
    expect(buildCalls.length).toBe(1);

    // Verify that yarn && yarn build was called after git clone
    const cloneIndex = execSpy.mock.calls.findIndex(([cmd]) => typeof cmd === 'string' && cmd.startsWith('git clone '));
    const buildIndex = execSpy.mock.calls.findIndex(([cmd, opts]) => typeof cmd === 'string' && cmd.includes('yarn') && cmd.includes('build') && opts?.cwd === expectedCwd);
    expect(cloneIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(cloneIndex);
  }, 120 * 1000);
});