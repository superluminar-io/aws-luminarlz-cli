import fs from 'fs';
import path from 'path';
import { DescribeOrganizationCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Cli } from 'clipanion';
import { Init } from '../../src/commands/init';
import { LzaCoreBootstrap } from '../../src/commands/lza-core-bootstrap';
import { AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME, LZA_ACCELERATOR_PACKAGE_PATH, LZA_SOURCE_PATH, loadConfigSync } from '../../src/config';
import { getCheckoutPath } from '../../src/core/accelerator/repository/checkout';
import * as execModule from '../../src/core/util/exec';
import { TestProjectDirectory } from '../../src/test-helper/test-project-directory';

describe('LZA Core Bootstrap command', () => {
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

    // Set up executeCommand spy with passthrough. Intercept only:
    // - git clone ... (avoid network)
    // - yarn && yarn build in LZA checkout (avoid building repo)
    // - yarn run ts-node --transpile-only cdk.ts synth ... (avoid running LZA synth)
    // - yarn run ts-node --transpile-only cdk.ts bootstrap ... (avoid running bootstrap)
    // Do NOT intercept `npx cdk synth` from customizationsCdkSynth
    execSpy = jest.spyOn(execModule, 'executeCommand').mockImplementation(((command: any, opts: any) => {
      if (typeof command === 'string') {
        if (command.startsWith('git clone ')) {
          return Promise.resolve({ stdout: '', stderr: '' } as any) as any;
        }
        // yarn && yarn build interception (in checkout source path)
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

  it('should synthesize, run accelerator synth, and bootstrap after initializing a project', async () => {
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

    // Now create CLI instance with LzaCoreBootstrap command
    const cli = new Cli();
    cli.register(LzaCoreBootstrap);

    // Run the lza core bootstrap command
    const exitCode = await cli.run(['lza', 'core', 'bootstrap']);

    // Verify command was successful
    expect(exitCode).toBe(0);

    // Verify that the accelerator config output directory was created and contains files
    const config = loadConfigSync();
    const outPath = path.join(testProjectDirectory.directory, config.awsAcceleratorConfigOutPath);
    expect(fs.existsSync(outPath)).toBe(true);
    const outFiles = fs.readdirSync(outPath, { recursive: false });
    expect(outFiles.length).toBeGreaterThan(0);

    // Ensure executeCommand was called to clone the repository and then build it
    const expectedCheckoutSourceCwd = path.join(getCheckoutPath(), LZA_SOURCE_PATH);
    const cloneCalls = execSpy.mock.calls.filter(([cmd]) => typeof cmd === 'string' && cmd.startsWith('git clone '));
    expect(cloneCalls.length).toBeGreaterThan(0);

    const buildCalls = execSpy.mock.calls.filter(([cmd, opts]) => typeof cmd === 'string' && cmd.includes('yarn') && cmd.includes('build') && opts?.cwd === expectedCheckoutSourceCwd);
    expect(buildCalls.length).toBeGreaterThan(0);

    // Verify order: clone -> build
    const cloneIndex = execSpy.mock.calls.findIndex(([cmd]) => typeof cmd === 'string' && cmd.startsWith('git clone '));
    const buildIndex = execSpy.mock.calls.findIndex(([cmd, opts]) => typeof cmd === 'string' && cmd.includes('yarn') && cmd.includes('build') && opts?.cwd === expectedCheckoutSourceCwd);
    expect(cloneIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(cloneIndex);

    // Ensure executeCommand was called to run accelerator cdk synth with correct parameters and cwd
    const expectedAccelCwd = path.join(getCheckoutPath(), LZA_ACCELERATOR_PACKAGE_PATH);
    const synthCalls = execSpy.mock.calls.filter(([cmd, opts]) => typeof cmd === 'string' && cmd.startsWith('yarn run ts-node') && cmd.includes('cdk.ts synth') && opts?.cwd === expectedAccelCwd);
    expect(synthCalls.length).toBe(1);

    // Ensure executeCommand was called to run accelerator cdk bootstrap with correct cwd
    const bootstrapCalls = execSpy.mock.calls.filter(([cmd, opts]) => typeof cmd === 'string' && cmd.startsWith('yarn run ts-node') && cmd.includes('cdk.ts bootstrap') && opts?.cwd === expectedAccelCwd);
    expect(bootstrapCalls.length).toBe(1);

    // Verify order: synth -> bootstrap
    const synthIndex = execSpy.mock.calls.findIndex(([cmd, opts]) => typeof cmd === 'string' && cmd.startsWith('yarn run ts-node') && cmd.includes('cdk.ts synth') && opts?.cwd === expectedAccelCwd);
    const bootstrapIndex = execSpy.mock.calls.findIndex(([cmd, opts]) => typeof cmd === 'string' && cmd.startsWith('yarn run ts-node') && cmd.includes('cdk.ts bootstrap') && opts?.cwd === expectedAccelCwd);
    expect(synthIndex).toBeGreaterThan(buildIndex);
    expect(bootstrapIndex).toBeGreaterThan(synthIndex);
  }, 180 * 1000);
});
