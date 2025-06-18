import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { Deploy } from '../../src/commands/deploy';
import { executeCommand } from '../../src/core/util/exec';

// Mock executeCommand
jest.mock('../../src/core/util/exec', () => ({
  executeCommand: jest.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

describe('Deploy Command', () => {
  // Mock AWS SDK clients
  const s3Mock = mockClient(S3Client);

  // Setup temporary directory
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Reset mocks
    s3Mock.reset();
    jest.clearAllMocks();

    // Setup AWS SDK mock responses
    s3Mock.on(PutObjectCommand).resolves({});

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

    // Create a sample assets.json file for testing customizationsPublishCdkAssets
    fs.writeFileSync(
      path.join(tempDir, 'customizations/cdk.out', 'sample.assets.json'),
      JSON.stringify({ assets: {} }),
    );
  });

  afterEach(() => {
    // Change back to original directory
    process.chdir(originalCwd);

    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('should synthesize, publish assets, and publish config', async () => {
    // Create an instance of the Deploy command
    const deploy = new Deploy();

    // Execute the command
    await deploy.execute();

    // Verify executeCommand was called with the right arguments
    // For customizationsCdkSynth
    expect(executeCommand).toHaveBeenCalledWith('npx cdk synth ', {
      cwd: expect.stringContaining('customizations'),
    });

    // For customizationsPublishCdkAssets
    expect(executeCommand).toHaveBeenCalledWith(
      'export AWS_REGION="us-east-1" && npx cdk-assets publish -p "' +
      path.join(tempDir, 'customizations/cdk.out', 'sample.assets.json') + '"',
      {
        cwd: expect.stringContaining('customizations'),
      },
    );

    // Verify S3 PutObject was called for publishConfigOut
    expect(s3Mock.calls()).toHaveLength(1);
    expect(s3Mock.calls()[0].args[0].input).toMatchObject({
      Bucket: 'aws-accelerator-config-123456789012-us-east-1',
      Key: 'zipped/aws-accelerator-config.zip',
    });

    // Verify output directories and files were created
    expect(fs.existsSync(path.join(tempDir, 'aws-accelerator-config.out'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'aws-accelerator-config.out.zip'))).toBe(true);
  });
});
