import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CloudFormationClient, DescribeStacksCommand, UpdateStackCommand } from '@aws-sdk/client-cloudformation';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { LzaInstallerVersionUpdate } from '../../src/commands/lza-installer-version-update';
import { AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME } from '../../src/config';

// Mock CloudFormation waiters
jest.mock('@aws-sdk/client-cloudformation', () => {
  const originalModule = jest.requireActual('@aws-sdk/client-cloudformation');
  return {
    ...originalModule,
    waitUntilStackUpdateComplete: jest.fn().mockResolvedValue({}),
  };
});

describe('LzaInstallerVersionUpdate Command', () => {
  // Mock AWS SDK clients
  const ssmMock = mockClient(SSMClient);
  const cfnMock = mockClient(CloudFormationClient);

  // Setup temporary directory
  let tempDir: string;
  let originalCwd: string;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset mocks
    ssmMock.reset();
    cfnMock.reset();

    // Mock console.log
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Create temporary directory and change to it
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luminarlz-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Create a minimal config.ts file in the temporary directory
    fs.writeFileSync(
      path.join(tempDir, 'config.ts'),
      `
      export const config = {
        awsAcceleratorConfigOutPath: 'aws-accelerator-config.out',
        awsAcceleratorConfigTemplates: 'templates',
        customizationPath: 'customizations',
        cdkOutPath: 'customizations/cdk.out',
        globalRegion: 'us-east-1',
        awsAcceleratorConfigBucketPattern: 'aws-accelerator-config-%s-%s',
        awsAcceleratorConfigDeploymentArtifactPath: 'zipped/aws-accelerator-config.zip',
        cdkAccelAssetsBucketNamePattern: 'cdk-accel-assets-%s-',
        awsAcceleratorPipelineName: 'AWSAccelerator-Pipeline',
        awsAcceleratorInstallerStackName: 'AWSAccelerator-InstallerStack',
        awsAcceleratorInstallerRepositoryBranchNamePrefix: 'release/v',
        awsAcceleratorInstallerStackTemplateUrlPattern: 'https://s3.amazonaws.com/solutions-reference/landing-zone-accelerator-on-aws/v%s/AWSAccelerator-InstallerStack.template',
        awsAcceleratorVersion: '1.5.0',
        environments: {
          production: 'production',
        },
        templates: [
          {
            fileName: 'accounts-config.yaml',
            parameters: {},
          },
        ],
        managementAccountId: '123456789012',
        homeRegion: 'us-east-1',
        enabledRegions: ['us-east-1'],
      },
      `,
    );
  });

  afterEach(() => {
    // Restore console.log
    consoleSpy.mockRestore();

    // Change back to original directory
    process.chdir(originalCwd);

    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('should update installer version when configured version is greater', async () => {
    // Setup AWS SDK mock responses
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: '1.4.0', // This is less than the version in the config (1.5.0)
      },
    });

    cfnMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'AWSAccelerator-InstallerStack',
          CreationTime: new Date(),
          StackStatus: 'CREATE_COMPLETE',
          Parameters: [
            {
              ParameterKey: 'RepositoryBranchName',
              ParameterValue: 'release/v1.4.0',
            },
            {
              ParameterKey: 'OtherParameter',
              ParameterValue: 'OtherValue',
            },
          ],
        },
      ],
    });

    cfnMock.on(UpdateStackCommand).resolves({});

    // Create an instance of the LzaInstallerVersionUpdate command
    const command = new LzaInstallerVersionUpdate();

    // Execute the command
    await command.execute();

    // Verify SSM client was called with the right parameters
    expect(ssmMock.calls()).toHaveLength(1);
    expect(ssmMock.calls()[0].args[0].input).toMatchObject({
      Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
    });

    // Verify CloudFormation client was called with the right parameters
    expect(cfnMock.calls()).toHaveLength(2);
    expect(cfnMock.calls()[0].args[0].input).toMatchObject({
      StackName: 'AWSAccelerator-InstallerStack',
    });
    expect(cfnMock.calls()[1].args[0].input).toMatchObject({
      StackName: 'AWSAccelerator-InstallerStack',
      Parameters: [
        {
          ParameterKey: 'RepositoryBranchName',
          ParameterValue: 'release/v1.5.0',
        },
        {
          ParameterKey: 'OtherParameter',
          UsePreviousValue: true,
        },
      ],
      TemplateURL: 'https://s3.amazonaws.com/solutions-reference/landing-zone-accelerator-on-aws/v1.5.0/AWSAccelerator-InstallerStack.template',
      Capabilities: ['CAPABILITY_IAM'],
    });
  });

  test('should not update installer version when configured version is the same', async () => {
    // Setup AWS SDK mock responses
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: '1.5.0', // This is the same as the version in the config
      },
    });

    // Create an instance of the LzaInstallerVersionUpdate command
    const command = new LzaInstallerVersionUpdate();

    // Execute the command
    await command.execute();

    // Verify SSM client was called with the right parameters
    expect(ssmMock.calls()).toHaveLength(1);
    expect(ssmMock.calls()[0].args[0].input).toMatchObject({
      Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
    });

    // Verify CloudFormation client was not called
    expect(cfnMock.calls()).toHaveLength(0);

    // Verify console.log was called with the right message
    expect(consoleSpy).toHaveBeenCalledWith('Installer version: 1.5.0 is already up to date');
  });

  test('should throw an error when configured version is less than installer version', async () => {
    // Setup AWS SDK mock responses
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: '1.6.0', // This is greater than the version in the config (1.5.0)
      },
    });

    // Create an instance of the LzaInstallerVersionUpdate command
    const command = new LzaInstallerVersionUpdate();

    // Execute the command and expect it to throw an error
    await expect(command.execute()).rejects.toThrow('Version mismatch');
  });
});
