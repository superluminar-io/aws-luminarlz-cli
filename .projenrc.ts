import { typescript, github } from 'projen';
import { JobPermission } from 'projen/lib/github/workflows-model';
import { NpmAccess } from 'projen/lib/javascript';

const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: '@superluminar-io/aws-luminarlz-cli',
  description:
    'A lean, opinionated CLI to make deployment and development with the Landing Zone Accelerator on AWS easier.',
  projenrcTs: true,
  autoDetectBin: true,
  license: 'MIT',
  authorOrganization: true,
  authorUrl: 'https://superluminar.io',
  authorName: 'superluminar GmbH',
  releaseToNpm: true,
  npmTrustedPublishing: true,
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
  devDeps: ['aws-sdk-client-mock', 'aws-sdk-client-mock-jest'],
  sampleCode: false,
  gitignore: ['/blueprints/**/package-lock.json', '/blueprints/**/yarn.lock'],
  githubOptions: {
    projenCredentials: github.GithubCredentials.fromApp(),
  },
});
project.jest!.config.setupFilesAfterEnv = ['<rootDir>/test/jest-setup.ts'];
project.jest!.config.testTimeout = 120_000;
project.jest!.config.coveragePathIgnorePatterns = ['/test/', '/node_modules/'];

project.tsconfigDev?.file?.addOverride('compilerOptions.types', [
  'node',
  'jest',
  'aws-sdk-client-mock-jest',
]);
project.tsconfigDev?.file?.addOverride('files', [
  'test/jest.custom-matchers.d.ts',
]);
project.tsconfigDev?.file?.addOverride('compilerOptions.allowJs', true);

// GitHub Workflow for tests
const wf = project.github!.addWorkflow('test');
wf.on({ push: { branches: ['main'] }, pullRequest: {} });
wf.addJobs({
  test: {
    permissions: { contents: JobPermission.READ },
    runsOn: ['ubuntu-latest'],
    steps: [
      {
        name: 'Checkout',
        uses: 'actions/checkout@v5',
        with: {
          ref: '${{ github.event.pull_request.head.ref }}',
          repository: '${{ github.event.pull_request.head.repo.full_name }}',
        },
      },
      {
        name: 'Setup Node',
        uses: 'actions/setup-node@v6',
        with: {
          'node-version': '22', // or matrix if you want multiple versions
          'cache': 'yarn', // change to "yarn" or "pnpm" if you use those
        },
      },
      { name: 'Install deps', run: 'yarn --frozen-lockfile' },
      { name: 'Run tests', run: 'yarn projen test' },
    ],
  },
});

project.synth();
