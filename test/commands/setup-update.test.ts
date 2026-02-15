import * as fs from 'fs';
import * as path from 'path';
import { OrganizationsClient, DescribeOrganizationCommand, ListRootsCommand } from '@aws-sdk/client-organizations';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SSOAdminClient, ListInstancesCommand } from '@aws-sdk/client-sso-admin';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Init } from '../../src/commands/init';
import { SetupUpdate } from '../../src/commands/setup-update';
import { AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME } from '../../src/config';
import { updateBlueprint } from '../../src/core/blueprint/blueprint';
import {
  TEST_ACCOUNT_ID,
  TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
  TEST_EMAIL,
  TEST_MASTER_EMAIL,
  TEST_ORGANIZATION_ID,
  TEST_REGION,
  TEST_ROOT_ID,
  TEST_USER_ID,
} from '../constants';
import { createCliFor, runCli } from '../test-helper/cli';
import { useTempDir } from '../test-helper/use-temp-dir';

let temp: ReturnType<typeof useTempDir>;

const stsMock = mockClient(STSClient);
const orgMock = mockClient(OrganizationsClient);
const ssoMock = mockClient(SSOAdminClient);
const ssmMock = mockClient(SSMClient);

const initializeAwsMocks = () => {
  stsMock.on(GetCallerIdentityCommand).resolves({
    Account: TEST_ACCOUNT_ID,
    Arn: `arn:aws:iam::${TEST_ACCOUNT_ID}:user/test-user`,
    UserId: TEST_USER_ID,
  });

  orgMock.on(DescribeOrganizationCommand).resolves({
    Organization: {
      Id: TEST_ORGANIZATION_ID,
      Arn: `arn:aws:organizations::${TEST_ACCOUNT_ID}:organization/${TEST_ORGANIZATION_ID}`,
      FeatureSet: 'ALL',
      MasterAccountArn: `arn:aws:organizations::${TEST_ACCOUNT_ID}:account/${TEST_ORGANIZATION_ID}/${TEST_ACCOUNT_ID}`,
      MasterAccountEmail: TEST_MASTER_EMAIL,
      MasterAccountId: TEST_ACCOUNT_ID,
    },
  });

  orgMock.on(ListRootsCommand).resolves({
    Roots: [
      {
        Id: TEST_ROOT_ID,
        Arn: `arn:aws:organizations::${TEST_ACCOUNT_ID}:root/${TEST_ORGANIZATION_ID}/${TEST_ROOT_ID}`,
        Name: 'Root',
        PolicyTypes: [],
      },
    ],
  });

  ssoMock.on(ListInstancesCommand).resolves({
    Instances: [
      {
        InstanceArn: 'arn:aws:sso:::instance/ssoins-12345678901234567',
        IdentityStoreId: 'd-12345678ab',
      },
    ],
  });

  ssmMock.on(GetParameterCommand).resolves({
    Parameter: {
      Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
      Value: TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
      Type: 'String',
    },
  });
};

const initializeProject = async () => {
  const cli = createCliFor(Init, SetupUpdate);

  await runCli(cli, [
    'init',
    '--region', TEST_REGION,
    '--accounts-root-email', TEST_EMAIL,
  ], temp);

  return cli;
};

const readConfig = (): { configPath: string; content: string } => {
  const configPath = path.join(temp.directory, 'config.ts');
  const content = fs.readFileSync(configPath, 'utf8');
  return { configPath, content };
};

const readPackageJson = (): { packagePath: string; content: string } => {
  const packagePath = path.join(temp.directory, 'package.json');
  const content = fs.readFileSync(packagePath, 'utf8');
  return { packagePath, content };
};

describe('Setup files update command', () => {
  beforeEach(() => {
    temp = useTempDir();

    jest.clearAllMocks();
    stsMock.reset();
    orgMock.reset();
    ssoMock.reset();
    ssmMock.reset();

    initializeAwsMocks();
  });

  afterEach(() => {
    temp.restore();
  });

  describe('when updating existing blueprint files through the CLI', () => {
    it('should restore a changed file when update is run with --yes', async () => {
      const cli = await initializeProject();
      const { configPath, content: baselineConfig } = readConfig();
      fs.writeFileSync(configPath, `${baselineConfig}\n// local-change`);

      await runCli(cli, [
        'setup',
        'update',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
        '--yes',
      ], temp);

      const { content: actualConfig } = readConfig();
      expect(actualConfig).toBe(baselineConfig);
    });

    it('should keep local file content unchanged when update is run with --dry-run', async () => {
      const cli = await initializeProject();
      const { configPath, content: baselineConfig } = readConfig();
      const localConfig = `${baselineConfig}\n// local-change`;
      fs.writeFileSync(configPath, localConfig);

      await runCli(cli, [
        'setup',
        'update',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
        '--yes',
        '--dry-run',
      ], temp);

      const { content: actualConfig } = readConfig();
      expect(actualConfig).toBe(localConfig);
    });

    it('should use defaults from config.ts when --region and --accounts-root-email are omitted', async () => {
      const cli = await initializeProject();

      await runCli(cli, [
        'setup',
        'update',
        '--yes',
        '--dry-run',
      ], temp);
    });

    it('should accept --line-mode together with --yes and --dry-run', async () => {
      const cli = await initializeProject();

      await runCli(cli, [
        'setup',
        'update',
        '--yes',
        '--line-mode',
        '--dry-run',
      ], temp);
    });
  });

  describe('when applying existing-file decisions through updateBlueprint', () => {
    it('should apply a partial content decision for a changed file', async () => {
      const initCli = createCliFor(Init);
      await runCli(initCli, [
        'init',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
      ], temp);

      const { configPath, content: baselineConfig } = readConfig();
      fs.writeFileSync(configPath, `${baselineConfig}\n// local-change`);

      const result = await updateBlueprint('foundational', {
        accountsRootEmail: TEST_EMAIL,
        region: TEST_REGION,
        onExistingFileDiff: async (fileDiff) => {
          if (fileDiff.relativePath !== 'config.ts') {
            return 'skip';
          }
          return { updatedContent: `${fileDiff.currentContent}\n// keep-partial` };
        },
      });

      const { content: actualConfig } = readConfig();
      expect(result.updatedCount).toBe(1);
      expect(actualConfig.includes('// local-change')).toBe(true);
      expect(actualConfig.endsWith('// keep-partial')).toBe(true);
    });

    it('should count a changed file as skipped when no existing-file decision handler is provided', async () => {
      const initCli = createCliFor(Init);
      await runCli(initCli, [
        'init',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
      ], temp);

      const { configPath, content: baselineConfig } = readConfig();
      const localConfig = `${baselineConfig}\n// local-change`;
      fs.writeFileSync(configPath, localConfig);

      const result = await updateBlueprint('foundational', {
        accountsRootEmail: TEST_EMAIL,
        region: TEST_REGION,
      });

      const { content: actualConfig } = readConfig();
      expect(result.updatedCount).toBe(0);
      expect(result.skippedCount).toBeGreaterThanOrEqual(1);
      expect(actualConfig).toBe(localConfig);
    });

    it('should count an unchanged partial decision as skipped when updatedContent matches current content', async () => {
      const initCli = createCliFor(Init);
      await runCli(initCli, [
        'init',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
      ], temp);

      const { configPath, content: baselineConfig } = readConfig();
      const localConfig = `${baselineConfig}\n// local-change`;
      fs.writeFileSync(configPath, localConfig);

      const result = await updateBlueprint('foundational', {
        accountsRootEmail: TEST_EMAIL,
        region: TEST_REGION,
        onExistingFileDiff: async (fileDiff) => {
          if (fileDiff.relativePath !== 'config.ts') {
            return 'skip';
          }
          return { updatedContent: fileDiff.currentContent };
        },
      });

      const { content: actualConfig } = readConfig();
      expect(result.updatedCount).toBe(0);
      expect(result.skippedCount).toBeGreaterThanOrEqual(1);
      expect(actualConfig).toBe(localConfig);
    });

    it('should not write files in dry-run mode even when decision is apply', async () => {
      const initCli = createCliFor(Init);
      await runCli(initCli, [
        'init',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
      ], temp);

      const { configPath, content: baselineConfig } = readConfig();
      const localConfig = `${baselineConfig}\n// local-change`;
      fs.writeFileSync(configPath, localConfig);

      const result = await updateBlueprint('foundational', {
        accountsRootEmail: TEST_EMAIL,
        region: TEST_REGION,
        dryRun: true,
        onExistingFileDiff: async () => 'apply',
      });

      const { content: actualConfig } = readConfig();
      expect(result.updatedCount).toBeGreaterThanOrEqual(1);
      expect(actualConfig).toBe(localConfig);
    });

    it('should write rendered content and count updated when decision is apply', async () => {
      const initCli = createCliFor(Init);
      await runCli(initCli, [
        'init',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
      ], temp);

      const { configPath, content: baselineConfig } = readConfig();
      const localConfig = `${baselineConfig}\n// local-change`;
      fs.writeFileSync(configPath, localConfig);

      const result = await updateBlueprint('foundational', {
        accountsRootEmail: TEST_EMAIL,
        region: TEST_REGION,
        onExistingFileDiff: async () => 'apply',
      });

      const { content: actualConfig } = readConfig();
      expect(result.updatedCount).toBeGreaterThanOrEqual(1);
      expect(actualConfig).toBe(baselineConfig);
    });

    it('should write updatedContent and count updated when updatedContent differs from current content', async () => {
      const initCli = createCliFor(Init);
      await runCli(initCli, [
        'init',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
      ], temp);

      const { configPath, content: baselineConfig } = readConfig();
      fs.writeFileSync(configPath, `${baselineConfig}\n// local-change`);

      const result = await updateBlueprint('foundational', {
        accountsRootEmail: TEST_EMAIL,
        region: TEST_REGION,
        onExistingFileDiff: async (fileDiff) => {
          if (fileDiff.relativePath !== 'config.ts') {
            return 'skip';
          }
          return { updatedContent: `${fileDiff.currentContent}\n// updated-by-handler` };
        },
      });

      const { content: actualConfig } = readConfig();
      expect(result.updatedCount).toBe(1);
      expect(actualConfig.endsWith('// updated-by-handler')).toBe(true);
    });

    it('should count skipped when decision is skip', async () => {
      const initCli = createCliFor(Init);
      await runCli(initCli, [
        'init',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
      ], temp);

      const { configPath, content: baselineConfig } = readConfig();
      const localConfig = `${baselineConfig}\n// local-change`;
      fs.writeFileSync(configPath, localConfig);

      const result = await updateBlueprint('foundational', {
        accountsRootEmail: TEST_EMAIL,
        region: TEST_REGION,
        onExistingFileDiff: async () => 'skip',
      });

      const { content: actualConfig } = readConfig();
      expect(result.updatedCount).toBe(0);
      expect(result.skippedCount).toBeGreaterThanOrEqual(1);
      expect(actualConfig).toBe(localConfig);
    });

    it('should count created when a blueprint file does not exist in the target project', async () => {
      const initCli = createCliFor(Init);
      await runCli(initCli, [
        'init',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
      ], temp);

      const { packagePath, content: baselinePackageJson } = readPackageJson();
      fs.unlinkSync(packagePath);

      const result = await updateBlueprint('foundational', {
        accountsRootEmail: TEST_EMAIL,
        region: TEST_REGION,
      });

      const { content: actualPackageJson } = readPackageJson();
      expect(result.createdCount).toBeGreaterThanOrEqual(1);
      expect(actualPackageJson).toBe(baselinePackageJson);
    });

    it('should count unchanged when all blueprint files already match', async () => {
      const initCli = createCliFor(Init);
      await runCli(initCli, [
        'init',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
      ], temp);

      const result = await updateBlueprint('foundational', {
        accountsRootEmail: TEST_EMAIL,
        region: TEST_REGION,
      });

      expect(result.updatedCount).toBe(0);
      expect(result.skippedCount).toBe(0);
      expect(result.unchangedCount).toBeGreaterThan(0);
    });

    it('should return mixed counters when created updated skipped and unchanged files are all present', async () => {
      const initCli = createCliFor(Init);
      await runCli(initCli, [
        'init',
        '--region', TEST_REGION,
        '--accounts-root-email', TEST_EMAIL,
      ], temp);

      const { packagePath } = readPackageJson();
      fs.unlinkSync(packagePath);

      const { configPath, content: baselineConfig } = readConfig();
      fs.writeFileSync(configPath, `${baselineConfig}\n// local-change`);

      const readmePath = path.join(temp.directory, 'README.md');
      const baselineReadme = fs.readFileSync(readmePath, 'utf8');
      fs.writeFileSync(readmePath, `${baselineReadme}\nlocal readme change`);

      const result = await updateBlueprint('foundational', {
        accountsRootEmail: TEST_EMAIL,
        region: TEST_REGION,
        onExistingFileDiff: async (fileDiff) => {
          if (fileDiff.relativePath === 'config.ts') {
            return 'apply';
          }
          if (fileDiff.relativePath === 'README.md') {
            return 'skip';
          }
          return 'skip';
        },
      });

      expect(result.createdCount).toBeGreaterThan(0);
      expect(result.updatedCount).toBeGreaterThan(0);
      expect(result.skippedCount).toBeGreaterThan(0);
      expect(result.unchangedCount).toBeGreaterThan(0);
    });
  });

});
