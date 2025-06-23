import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStacksCommand,
  UpdateStackCommand,
} from '@aws-sdk/client-cloudformation';
import { mockClient } from 'aws-sdk-client-mock';
import { LzaCustomizationsStackDeploy } from '../../src/commands/lza-customizations-stack-deploy';
import { checkVersion } from '../../src/core/accelerator/installer/installer';
// @ts-expect-error - getCheckoutPath is used in the mock setup
import { ensureCheckoutExists, getCheckoutPath, readCustomizationsStackTemplateBody } from '../../src/core/accelerator/repository/checkout';
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
  readCustomizationsStackTemplateBody: jest.fn().mockReturnValue('{"Resources":{}}'),
}));

// Mock CloudFormation waiters
jest.mock('@aws-sdk/client-cloudformation', () => {
  const originalModule = jest.requireActual('@aws-sdk/client-cloudformation');
  return {
    ...originalModule,
    waitUntilStackUpdateComplete: jest.fn().mockResolvedValue({}),
    waitUntilStackCreateComplete: jest.fn().mockResolvedValue({}),
  };
});

describe('LzaCustomizationsStackDeploy Command', () => {
  // Mock AWS SDK clients
  const cfnMock = mockClient(CloudFormationClient);

  // Setup temporary directory
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Reset mocks
    cfnMock.reset();
    jest.clearAllMocks();

    // Setup AWS SDK mock responses
    cfnMock.on(DescribeStacksCommand).resolves({
      Stacks: [{
        StackName: 'TestStack',
        CreationTime: new Date(),
        StackStatus: 'CREATE_COMPLETE',
      }],
    });
    cfnMock.on(UpdateStackCommand).resolves({});
    cfnMock.on(CreateStackCommand).resolves({});

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

  test('should deploy a customizations stack', async () => {
    // Create an instance of the LzaCustomizationsStackDeploy command
    const command = new LzaCustomizationsStackDeploy();

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

    // For customizationsPublishCdkAssets
    expect(executeCommand).toHaveBeenCalledWith(
      expect.stringContaining('export AWS_REGION="us-east-1" && npx cdk-assets publish -p'),
      expect.any(Object),
    );

    // For customizationsDeployStack
    expect(readCustomizationsStackTemplateBody).toHaveBeenCalledWith({
      accountId: '123456789012',
      region: 'us-east-1',
      stackName: 'TestStack',
    });

    // Verify CloudFormation client was called
    expect(cfnMock.calls()).toHaveLength(2); // DescribeStacksCommand and UpdateStackCommand
    expect(cfnMock.calls()[0].args[0].input).toMatchObject({
      StackName: 'TestStack',
    });
    expect(cfnMock.calls()[1].args[0].input).toMatchObject({
      StackName: 'TestStack',
      TemplateBody: '{"Resources":{}}',
      Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
    });
  });

  test('should create a new stack if it does not exist', async () => {
    // Setup AWS SDK mock responses for stack not existing
    cfnMock.reset();
    cfnMock.on(DescribeStacksCommand).rejects(new Error('Stack does not exist'));
    cfnMock.on(CreateStackCommand).resolves({});

    // Create an instance of the LzaCustomizationsStackDeploy command
    const command = new LzaCustomizationsStackDeploy();

    // Set the required options
    command.stackName = 'TestStack';
    command.accountId = '123456789012';
    command.region = 'us-east-1';

    // Execute the command
    await command.execute();

    // Verify CloudFormation client was called
    expect(cfnMock.calls()).toHaveLength(2); // DescribeStacksCommand and CreateStackCommand
    expect(cfnMock.calls()[0].args[0].input).toMatchObject({
      StackName: 'TestStack',
    });
    expect(cfnMock.calls()[1].args[0].input).toMatchObject({
      StackName: 'TestStack',
      TemplateBody: '{"Resources":{}}',
      Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
    });
  });
});
