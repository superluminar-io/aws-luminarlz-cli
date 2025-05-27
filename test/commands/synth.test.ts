import fs from 'fs';
import path from 'path';
import { DescribeOrganizationCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Cli } from 'clipanion';
import { Init } from '../../src/commands/init';
import { Synth } from '../../src/commands/synth';
import { AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME, loadConfigSync } from '../../src/config';
import { executeCommand } from '../../src/core/util/exec';
import { TestProjectDirectory } from '../../src/test-helper/test-project-directory';

describe('Synth command', () => {
  const testProjectDirectory = new TestProjectDirectory();

  // Create mocks for AWS services (used during init rendering)
  const ssmMock = mockClient(SSMClient);
  const stsMock = mockClient(STSClient);
  const organizationsMock = mockClient(OrganizationsClient);
  const ssoAdminMock = mockClient(SSOAdminClient);

  beforeEach(() => {
    testProjectDirectory.initAndChangeToTempDirectory();

    // Clear and reset mocks before each test
    ssmMock.reset();
    stsMock.reset();
    organizationsMock.reset();
    ssoAdminMock.reset();
    jest.clearAllMocks();

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

  afterEach(() => {
    testProjectDirectory.changeToOriginalAndCleanUpTempDirectory();
  });

  it('should synthesize after initializing a project with the specified blueprint', async () => {
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
    await executeCommand('npm install', { cwd: testProjectDirectory.directory });

    // Verify init was successful
    expect(initExitCode).toBe(0);

    // Now create CLI instance with Synth command
    const synthCli = new Cli();
    synthCli.register(Synth);

    // Run the synth command
    const synthExitCode = await synthCli.run(['synth']);

    // Verify synth was successful
    expect(synthExitCode).toBe(0);

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
  }, 120 * 1000);
});
