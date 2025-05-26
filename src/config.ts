import * as fs from 'node:fs';
import * as path from 'node:path';
import { format } from 'util';
import { readConfigFile, transpileModule } from 'typescript';
import { resolveProjectPath } from './core/util/path';


export const AWS_ACCELERATOR_CONFIG_OUT_PATH = 'aws-accelerator-config.out';
export const AWS_ACCELERATOR_CONFIG_TEMPLATES = 'templates';
export const CUSTOMIZATION_PATH = 'customizations';
export const CDK_OUT_PATH = path.join(CUSTOMIZATION_PATH, 'cdk.out');

export const GLOBAL_REGION = 'us-east-1';

export const AWS_ACCELERATOR_CONFIG_BUCKET_PATTERN = 'aws-accelerator-config-%s-%s';
export const AWS_ACCELERATOR_CONFIG_DEPLOYMENT_ARTIFACT_PATH = 'zipped/aws-accelerator-config.zip';
export const CDK_ACCEL_ASSETS_BUCKET_NAME_PATTERN = 'cdk-accel-assets-%s-';
export const AWS_ACCELERATOR_PIPELINE_NAME = 'AWSAccelerator-Pipeline';
export const AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME = '/accelerator/AWSAccelerator-InstallerStack/version';
export const LZA_REPOSITORY_GIT_URL = 'https://github.com/awslabs/landing-zone-accelerator-on-aws.git';
export const LZA_SOURCE_PATH = 'source';
export const LZA_ACCELERATOR_PACKAGE_PATH = path.join(
  LZA_SOURCE_PATH,
  'packages',
  '@aws-accelerator',
  'accelerator',
);
export const AWS_ACCELERATOR_PIPELINE_FAILURE_TOPIC_NAME =
  'aws-accelerator-pipeline-failed-status-topic';
export const AWS_ACCELERATOR_SSM_PARAMETER_INSTALLER_KMS_KEY_ARN =
  '/accelerator/installer/kms/key-arn';
export const AWS_ACCELERATOR_INSTALLER_STACK_NAME = 'AWSAccelerator-InstallerStack';
export const AWS_ACCELERATOR_INSTALLER_REPOSITORY_BRANCH_NAME_PREFIX = 'release/v';
export const AWS_ACCELERATOR_INSTALLER_STACK_TEMPLATE_URL_PATTERN = 'https://s3.amazonaws.com/solutions-reference/landing-zone-accelerator-on-aws/v%s/AWSAccelerator-InstallerStack.template';

export interface Template {
  fileName: string;
  parameters?: object;
}

export interface BaseConfig {
  awsAcceleratorConfigOutPath: string;
  awsAcceleratorConfigTemplates: string;
  customizationPath: string;
  cdkOutPath: string;
  globalRegion: string;
  awsAcceleratorConfigBucketPattern: string;
  awsAcceleratorConfigDeploymentArtifactPath: string;
  cdkAccelAssetsBucketNamePattern: string;
  awsAcceleratorPipelineName: string;
  awsAcceleratorInstallerStackName: string;
  awsAcceleratorInstallerRepositoryBranchNamePrefix: string;
  awsAcceleratorInstallerStackTemplateUrlPattern: string;
}

export interface Config extends BaseConfig {
  awsAcceleratorVersion: string;
  environments: Record<string, string>;
  templates: Template[];
  managementAccountId: string;
  homeRegion: string;
  enabledRegions: string[];
}

export const baseConfig: BaseConfig = {
  awsAcceleratorConfigOutPath: AWS_ACCELERATOR_CONFIG_OUT_PATH,
  awsAcceleratorConfigTemplates: AWS_ACCELERATOR_CONFIG_TEMPLATES,
  customizationPath: CUSTOMIZATION_PATH,
  cdkOutPath: CDK_OUT_PATH,
  globalRegion: GLOBAL_REGION,
  awsAcceleratorConfigBucketPattern: AWS_ACCELERATOR_CONFIG_BUCKET_PATTERN,
  awsAcceleratorConfigDeploymentArtifactPath: AWS_ACCELERATOR_CONFIG_DEPLOYMENT_ARTIFACT_PATH,
  cdkAccelAssetsBucketNamePattern: CDK_ACCEL_ASSETS_BUCKET_NAME_PATTERN,
  awsAcceleratorPipelineName: AWS_ACCELERATOR_PIPELINE_NAME,
  awsAcceleratorInstallerStackName: AWS_ACCELERATOR_INSTALLER_STACK_NAME,
  awsAcceleratorInstallerRepositoryBranchNamePrefix: AWS_ACCELERATOR_INSTALLER_REPOSITORY_BRANCH_NAME_PREFIX,
  awsAcceleratorInstallerStackTemplateUrlPattern: AWS_ACCELERATOR_INSTALLER_STACK_TEMPLATE_URL_PATTERN,
};

let loadedConfig: Config | undefined;
export const loadConfigSync = (): Config => {
  // Only load config once per process
  if (loadedConfig) {
    return loadedConfig;
  }
  const tsFile = resolveProjectPath('config.ts');
  const jsFile = resolveProjectPath('config.js');

  // Transpile the TypeScript config file to JavaScript so we can require it event if this is executed only with nodejs
  const output = transpileModule(fs.readFileSync(tsFile, 'utf8'), {
    compilerOptions: readConfigFile(path.join(__dirname, '..', 'tsconfig.json'), (s) => s).config.compilerOptions,
  });
  fs.writeFileSync(jsFile, output.outputText);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  loadedConfig = require(jsFile).config;
  return loadedConfig!;
};

export const awsAcceleratorConfigBucketName = (config: Config): string => {
  return format(
    config.awsAcceleratorConfigBucketPattern,
    config.managementAccountId,
    config.homeRegion,
  );
};

export const cdkAccelAssetsBucketNamePrefix = (config: Config): string =>
  format(config.cdkAccelAssetsBucketNamePattern, config.managementAccountId);

export const awsAcceleratorInstallerStackTemplateUrl = (config: Config): string =>
  format(
    config.awsAcceleratorInstallerStackTemplateUrlPattern,
    config.awsAcceleratorVersion,
  );

export const awsAcceleratorInstallerRepositoryBranchName = (config: Config): string =>
  config.awsAcceleratorInstallerRepositoryBranchNamePrefix + config.awsAcceleratorVersion;