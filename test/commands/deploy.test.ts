import fs from 'fs';
import path from 'path';
import { DescribeOrganizationCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Cli } from 'clipanion';
import { Deploy } from '../../src/commands/deploy';
import { Init } from '../../src/commands/init';
import {
  AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
  awsAcceleratorConfigBucketName, loadConfigSync,
} from '../../src/config';
import * as assets from '../../src/core/customizations/assets';
import { executeCommand } from '../../src/core/util/exec';
import { TestProjectDirectory } from '../../src/test-helper/test-project-directory';

// Mock the assets module
jest.mock('../../src/core/customizations/assets', () => ({
  customizationsPublishCdkAssets: jest.fn(),
}));

describe('Deploy command', () => {
  const testProjectDirectory = new TestProjectDirectory();

  // Create mocks for AWS services
  const ssmMock = mockClient(SSMClient);
  const stsMock = mockClient(STSClient);
  const organizationsMock = mockClient(OrganizationsClient);
  const ssoAdminMock = mockClient(SSOAdminClient);
  const s3Mock = mockClient(S3Client);

  // Create spies for the functions
  let assetsSpy: jest.SpyInstance;

  beforeEach(() => {
    testProjectDirectory.initAndChangeToTempDirectory();

    // Clear mocks before each test
    ssmMock.reset();
    stsMock.reset();
    organizationsMock.reset();
    ssoAdminMock.reset();
    s3Mock.reset();

    // Reset all mocks
    jest.clearAllMocks();

    // Set up spies for the functions
    assetsSpy = jest.spyOn(assets, 'customizationsPublishCdkAssets').mockResolvedValue();

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

  it('should deploy after initializing a project with the specified blueprint', async () => {
    // Run the init command to set up the project
    const initCli = new Cli();
    initCli.register(Init);
    const initExitCode = await initCli.run([
      'init',
      '--accounts-root-email', 'test@example.com',
      '--region', 'us-east-1',
    ]);

    // Install dependencies after initialization
    await executeCommand('npm install', { cwd: testProjectDirectory.directory });

    // Verify init was successful
    expect(initExitCode).toBe(0);

    // Now create CLI instance with Deploy command
    const deployCli = new Cli();
    deployCli.register(Deploy);

    // Run the deploy command
    const deployExitCode = await deployCli.run(['deploy']);

    // Verify deploy was successful
    expect(deployExitCode).toBe(0);

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

    // Verify that accelerator config was uploaded to S3
    const s3Calls = s3Mock.commandCalls(PutObjectCommand);
    const callInput = s3Calls[0].args[0].input;
    expect(callInput.Bucket).toBe(awsAcceleratorConfigBucketName(config));
    expect(callInput.Key).toBe(config.awsAcceleratorConfigDeploymentArtifactPath);
    expect(Buffer.isBuffer(callInput.Body)).toBe(true);


    // Verify that the customizationsPublishCdkAssets function was called
    expect(assetsSpy).toHaveBeenCalled();
  }, 120 * 1000);
});
