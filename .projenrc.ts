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
    '@aws-cdk/cdk-assets-lib',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-cloudformation',
    '@aws-sdk/client-organizations',
    '@aws-sdk/client-ssm',
    '@aws-sdk/client-sso-admin',
    '@aws-sdk/client-sts',
    '@aws-sdk/credential-providers',
    'clipanion',
    'liquidjs',
    'typescript',
    'zip-lib',
  ],
  devDeps: [
    'aws-sdk-client-mock',
    'aws-sdk-client-mock-jest',
  ],
  sampleCode: false,
  gitignore: ['/blueprints/**/package-lock.json', '/blueprints/**/yarn.lock'],
  githubOptions: {
    projenCredentials: github.GithubCredentials.fromApp(),
  },
});
project.jest!.config.setupFilesAfterEnv = ['<rootDir>/test/jest-setup.ts'];
project.jest!.config.testTimeout = 120000;

project.tsconfigDev?.file?.addOverride('compilerOptions.types', [
  'node',
  'jest',
  'aws-sdk-client-mock-jest',
]);
project.tsconfigDev?.file?.addOverride('files', ['test/jest.custom-matchers.d.ts']);
project.tsconfigDev?.file?.addOverride('compilerOptions.composite', true);
project.tsconfigDev?.file?.addOverride('compilerOptions.allowJs', true);

project.tsconfig?.file?.addOverride('references', [
  { path: './tsconfig.dev.json' },
]);
project.synth();