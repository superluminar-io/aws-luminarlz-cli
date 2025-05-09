import { typescript } from 'projen';
import { NpmAccess } from 'projen/lib/javascript';

const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: '@superluminar-io/aws-luminarlz-cli',
  description: 'An opinionated CLI to make deployment and development with the AWS Landing Zone Accelerator easier. It uses Liquidjs (and optionally CDK) to generate the LZA config.',
  projenrcTs: true,
  autoDetectBin: true,
  license: 'MIT',
  authorOrganization: true,
  authorUrl: 'https://superluminar.io',
  authorName: 'superluminar GmbH',
  releaseToNpm: true,
  release: true,
  package: true,
  npmAccess: NpmAccess.PUBLIC,
  repository: 'https://github.com/superluminar-io/aws-luminarlz-cli.git',
  deps: [
    '@aws-sdk/client-s3',
    '@aws-sdk/client-cloudformation',
    '@aws-sdk/client-organizations',
    '@aws-sdk/client-ssm',
    '@aws-sdk/client-sso-admin',
    '@aws-sdk/client-sts',
    '@aws-sdk/credential-providers',
    'cdk-assets',
    'clipanion',
    'liquidjs',
    'typescript',
    'zip-lib',
  ],
  sampleCode: false,
  gitignore: ['/blueprints/**/package-lock.json', '/blueprints/**/yarn.lock'],
});
project.synth();