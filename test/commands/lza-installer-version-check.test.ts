import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { LzaInstallerVersionCheck } from '../../src/commands/lza-installer-version-check';
import { AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME } from '../../src/config';

describe('LzaInstallerVersionCheck Command', () => {
  // Mock AWS SDK clients
  const ssmMock = mockClient(SSMClient);

  // Setup temporary directory
  let tempDir: string;
  let originalCwd: string;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset mocks
    ssmMock.reset();

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

  test('should check if installer version is in sync', async () => {
    // Setup AWS SDK mock responses
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: '1.5.0', // This matches the version in the config
      },
    });

    // Create an instance of the LzaInstallerVersionCheck command
    const command = new LzaInstallerVersionCheck();

    // Execute the command
    await command.execute();

    // Verify SSM client was called with the right parameters
    expect(ssmMock.calls()).toHaveLength(1);
    expect(ssmMock.calls()[0].args[0].input).toMatchObject({
      Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
    });

    // Verify console.log was called with the right message
    expect(consoleSpy).toHaveBeenCalledWith('Installer version in sync: 1.5.0');
  });

  test('should throw an error if installer version is not in sync', async () => {
    // Setup AWS SDK mock responses
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: '1.4.0', // This doesn't match the version in the config
      },
    });

    // Create an instance of the LzaInstallerVersionCheck command
    const command = new LzaInstallerVersionCheck();

    // Execute the command and expect it to throw an error
    await expect(command.execute()).rejects.toThrow('AWS Accelerator version mismatch');
  });

  test('should throw an error if installer version is not found', async () => {
    // Setup AWS SDK mock responses
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: undefined, // No value
      },
    });

    // Create an instance of the LzaInstallerVersionCheck command
    const command = new LzaInstallerVersionCheck();

    // Execute the command and expect it to throw an error
    await expect(command.execute()).rejects.toThrow('AWS Accelerator version not found');
  });
});
