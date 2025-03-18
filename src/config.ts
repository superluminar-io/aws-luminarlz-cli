import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { format } from 'util';
import { readConfigFile, transpileModule } from 'typescript';
import { currentExecutionPath } from './util/path';


export const AWS_ACCELERATOR_CONFIG_OUT_PATH = 'aws-accelerator-config.out';
export const AWS_ACCELERATOR_CONFIG_TEMPLATES = 'templates';
export const CUSTOMIZATION_PATH = 'customizations';
export const CDK_OUT_PATH = path.join(CUSTOMIZATION_PATH, 'cdk.out');

export const GLOBAL_REGION = 'us-east-1';

export const AWS_ACCELERATOR_CONFIG_BUCKET_PATTERN = 'aws-accelerator-config-%s-%s';
export const CDK_ACCEL_ASSETS_BUCKET_NAME_PATTERN = 'cdk-accel-assets-%s-';
export const AWS_ACCELERATOR_PIPELINE_NAME = 'AWSAccelerator-Pipeline';
export const LZA_SOURCE_PATH = 'source';
export const LZA_ACCELERATOR_PACKAGE_PATH = path.join(
  LZA_SOURCE_PATH,
  'packages',
  '@aws-accelerator',
  'accelerator',
);
export const LZA_REPOSITORY_BRANCH = 'v1.11.2';
export const LZA_REPOSITORY_CHECKOUT_PATH = path.join(
  os.tmpdir(),
  `landing-zone-accelerator-on-aws-${LZA_REPOSITORY_BRANCH}`,
);

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
  cdkAccelAssetsBucketNamePattern: string;
  awsAcceleratorPipelineName: string;
}

export interface Config extends BaseConfig {
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
  cdkAccelAssetsBucketNamePattern: CDK_ACCEL_ASSETS_BUCKET_NAME_PATTERN,
  awsAcceleratorPipelineName: AWS_ACCELERATOR_PIPELINE_NAME,
};

export const loadConfigSync = (): Config => {
  const tsFile = currentExecutionPath('config.ts');
  const jsFile = currentExecutionPath('config.js');

  // Transpile the TypeScript config file to JavaScript so we can require it event if this is executed only with nodejs
  const output = transpileModule(fs.readFileSync(tsFile, 'utf8'), {
    compilerOptions: readConfigFile(path.join(__dirname, '..', 'tsconfig.json'), (s) => s).config.compilerOptions,
  });
  fs.writeFileSync(jsFile, output.outputText);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(jsFile).config;
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
