import { typescript, github } from 'projen';
import { NpmAccess } from 'projen/lib/javascript';

const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: '@superluminar-io/aws-luminarlz-cli',
  description: 'A lean, opinionated CLI to make deployment and development with the Landing Zone Accelerator on AWS easier.',
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
    'aws-sdk-client-mock',
    'cdk-assets',
    'clipanion',
    'liquidjs',
    'typescript',
    'zip-lib',
  ],
  sampleCode: false,
  gitignore: ['/blueprints/**/package-lock.json', '/blueprints/**/yarn.lock'],
  githubOptions: {
    projenCredentials: github.GithubCredentials.fromApp(),
  },
});
project.synth();