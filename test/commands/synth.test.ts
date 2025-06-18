import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { Synth } from '../../src/commands/synth';
import { executeCommand } from '../../src/core/util/exec';

// Mock executeCommand
jest.mock('../../src/core/util/exec', () => ({
  executeCommand: jest.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

describe('Synth Command', () => {
  // Mock AWS SDK clients
  const s3Mock = mockClient(S3Client);

  // Setup temporary directory
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Reset mocks
    s3Mock.reset();
    jest.clearAllMocks();

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

    // Create necessary directories
    fs.mkdirSync(path.join(tempDir, 'templates'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'customizations/cdk.out'), { recursive: true });

    // Create a sample template file
    fs.writeFileSync(
      path.join(tempDir, 'templates', 'accounts-config.yaml.liquid'),
      'accounts: {{ accounts }}',
    );
  });

  afterEach(() => {
    // Change back to original directory
    process.chdir(originalCwd);

    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('should synthesize configuration and customizations', async () => {
    // Create an instance of the Synth command
    const synth = new Synth();

    // Execute the command
    await synth.execute();

    // The executeCommand function is already imported and mocked

    // Verify executeCommand was called with the right arguments
    expect(executeCommand).toHaveBeenCalledWith('npx cdk synth ', {
      cwd: expect.stringContaining('customizations'),
    });

    // Verify output directories and files were created
    expect(fs.existsSync(path.join(tempDir, 'aws-accelerator-config.out'))).toBe(true);
  });
});
