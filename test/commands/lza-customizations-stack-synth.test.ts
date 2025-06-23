import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { LzaCustomizationsStackSynth } from '../../src/commands/lza-customizations-stack-synth';
import { checkVersion } from '../../src/core/accelerator/installer/installer';
import { ensureCheckoutExists } from '../../src/core/accelerator/repository/checkout';
import { executeCommand } from '../../src/core/util/exec';

// Mock executeCommand
jest.mock('../../src/core/util/exec', () => ({
  executeCommand: jest.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

// Mock checkVersion
jest.mock('../../src/core/accelerator/installer/installer', () => ({
  checkVersion: jest.fn().mockResolvedValue(undefined),
}));

// Mock repository checkout functions
jest.mock('../../src/core/accelerator/repository/checkout', () => ({
  ensureCheckoutExists: jest.fn().mockResolvedValue(undefined),
  getCheckoutPath: jest.fn().mockReturnValue('/mock/checkout/path'),
}));

describe('LzaCustomizationsStackSynth Command', () => {
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
    fs.mkdirSync(path.join(tempDir, 'aws-accelerator-config.out'), { recursive: true });

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

  test('should synthesize a customizations stack', async () => {
    // Create an instance of the LzaCustomizationsStackSynth command
    const command = new LzaCustomizationsStackSynth();

    // Set the required options
    command.stackName = 'TestStack';
    command.accountId = '123456789012';
    command.region = 'us-east-1';

    // Execute the command
    await command.execute();

    // Verify executeCommand was called with the right arguments
    // For customizationsCdkSynth
    expect(executeCommand).toHaveBeenCalledWith('npx cdk synth TestStack', {
      cwd: expect.stringContaining('customizations'),
    });

    // For synthStage
    expect(checkVersion).toHaveBeenCalled();
    expect(ensureCheckoutExists).toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith(
      expect.stringContaining('yarn run ts-node --transpile-only cdk.ts synth --stage customizations'),
      expect.any(Object),
    );

    // Verify output directories were created
    expect(fs.existsSync(path.join(tempDir, 'aws-accelerator-config.out'))).toBe(true);
  });
});
