import path from 'path';
import { CloudTrailClient, DescribeTrailsCommand } from '@aws-sdk/client-cloudtrail';
import { DescribeOrganizationCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Init } from '../../src/commands/init';
import { LzaCoreBootstrap } from '../../src/commands/lza-core-bootstrap';
import {
  AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
  LZA_ACCELERATOR_PACKAGE_PATH,
  loadConfigSync,
  LZA_REPOSITORY_GIT_URL, awsAcceleratorInstallerRepositoryBranchName, LZA_SOURCE_PATH,
} from '../../src/config';
import { getCheckoutPath } from '../../src/core/accelerator/repository/checkout';
import * as execModule from '../../src/core/util/exec';
import { resolveProjectPath } from '../../src/core/util/path';
import {
  TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
  TEST_ACCOUNT_ID,
  TEST_EMAIL,
  TEST_REGION,
  TEST_USER_ID, TEST_ORGANIZATION_ID, TEST_ROOT_ID,
} from '../constants';
import { createCliFor, runCli } from '../test-helper/cli';
import { installLocalLuminarlzCliForTests } from '../test-helper/install-local-luminarlz-cli';
import { useTempDir } from '../test-helper/use-temp-dir';

let temp: ReturnType<typeof useTempDir>;
describe('LZA Core Bootstrap command', () => {
  const ssmMock = mockClient(SSMClient);
  const stsMock = mockClient(STSClient);
  const organizationsMock = mockClient(OrganizationsClient);
  const ssoAdminMock = mockClient(SSOAdminClient);
  const cloudTrailMock = mockClient(CloudTrailClient);
  const LZA_PREFIX_PARAMETER_NAME = '/accelerator/lza-prefix';
  const FINALIZE_VERSION_PARAMETER_NAME = `/accelerator/AWSAccelerator-FinalizeStack-${TEST_ACCOUNT_ID}-${TEST_REGION}/version`;

  let execSpy: jest.SpyInstance;
  const realExecute = execModule.executeCommand;
  const repoRoot = path.resolve(__dirname, '..', '..');

  beforeEach(() => {
    temp = useTempDir();

    ssmMock.reset();
    stsMock.reset();
    organizationsMock.reset();
    ssoAdminMock.reset();
    cloudTrailMock.reset();
    jest.clearAllMocks();

    // Set up executeCommand spy with passthrough. Intercept only:
    // - git clone ... (avoid network)
    // - yarn && yarn build in LZA checkout (avoid building repo)
    // - yarn run ts-node --transpile-only cdk.ts synth ... (avoid running LZA synth)
    // - yarn run ts-node --transpile-only cdk.ts bootstrap ... (avoid running bootstrap)
    // Do NOT intercept `npx cdk synth` from customizationsCdkSynth
    execSpy = jest.spyOn(execModule, 'executeCommand').mockImplementation((command, opts) => {
      const cwd = typeof opts === 'object' && opts !== null && 'cwd' in opts
        ? opts.cwd
        : undefined;
      if (typeof command === 'string') {
        if (command.startsWith('git clone ')) {
          return realExecute('true');
        }
        if (command.startsWith('yarn')) {
          if (typeof cwd === 'string' && path.resolve(cwd) === repoRoot) {
            return realExecute(command, opts);
          }
          return realExecute('true');
        }
      }
      return realExecute(command, opts);
    });

    ssmMock.on(GetParameterCommand, {
      Name: LZA_PREFIX_PARAMETER_NAME,
    }).resolves({
      Parameter: {
        Name: LZA_PREFIX_PARAMETER_NAME,
        Value: 'AWSAccelerator',
        Type: 'String',
      },
    });
    ssmMock.on(GetParameterCommand, {
      Name: FINALIZE_VERSION_PARAMETER_NAME,
    }).resolves({
      Parameter: {
        Name: FINALIZE_VERSION_PARAMETER_NAME,
        Value: TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
        Type: 'String',
      },
    });
    ssmMock.on(GetParameterCommand, {
      Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
    }).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
        Value: TEST_AWS_ACCELERATOR_STACK_VERSION_1_12_2,
        Type: 'String',
      },
    });

    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: TEST_ACCOUNT_ID,
      Arn: `arn:aws:iam::${TEST_ACCOUNT_ID}:role/Admin`,
      UserId: TEST_USER_ID,
    });

    organizationsMock.on(DescribeOrganizationCommand).resolves({
      Organization: {
        Id: TEST_ORGANIZATION_ID,
        Arn: `arn:aws:organizations::${TEST_ACCOUNT_ID}:organization/${TEST_ORGANIZATION_ID}`,
        MasterAccountId: TEST_ACCOUNT_ID,
      },
    });

    organizationsMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: TEST_ROOT_ID,
          Arn: `arn:aws:organizations::${TEST_ACCOUNT_ID}:root/${TEST_ORGANIZATION_ID}/${TEST_ROOT_ID}`,
          Name: 'Root',
        },
      ],
    });

    ssoAdminMock.on(ListInstancesCommand).resolves({
      Instances: [
        {
          InstanceArn: 'arn:aws:sso:::instance/ssoins-example',
          IdentityStoreId: 'd-example123',
        },
      ],
    });

    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: `arn:aws:logs:${TEST_REGION}:${TEST_ACCOUNT_ID}:log-group:aws-controltower/CloudTrailLogs-xyz`,
        },
      ],
    });
  });

  afterEach(() => {
    temp.restore();
  });

  it('should synthesize, run accelerator synth, and bootstrap after initializing a project', async () => {
    const cli = createCliFor(Init, LzaCoreBootstrap);

    await runCli(cli, [
      'init',
      '--blueprint', 'foundational',
      '--accounts-root-email', TEST_EMAIL,
      '--region', TEST_REGION,
      '--force',
    ], temp);
    await installLocalLuminarlzCliForTests(temp);
    await runCli(cli, ['lza', 'core', 'bootstrap'], temp);

    const config = loadConfigSync();
    const checkoutPath = getCheckoutPath();
    const checkoutBranch = awsAcceleratorInstallerRepositoryBranchName(config);
    const lzaConfigPath = resolveProjectPath(
      config.awsAcceleratorConfigOutPath,
    );

    expect(config).toHaveCreatedCdkTemplates({ baseDir: temp.directory });
    expect(execSpy).toHaveBeenCalledInOrderWith(
      `git clone --depth=1 --branch ${checkoutBranch} ${LZA_REPOSITORY_GIT_URL} ${checkoutPath}`,
      [
        'yarn && yarn build',
        { cwd: path.join(checkoutPath, LZA_SOURCE_PATH) },
      ],
      [
        `yarn run ts-node --transpile-only cdk.ts synth --config-dir "${lzaConfigPath}" --partition aws`,
        { cwd: path.join(checkoutPath, LZA_ACCELERATOR_PACKAGE_PATH) },
      ],
      [
        `yarn run ts-node --transpile-only cdk.ts bootstrap --require-approval never --config-dir "${lzaConfigPath}" --partition aws`,
        { cwd: path.join(checkoutPath, LZA_ACCELERATOR_PACKAGE_PATH) },
      ],
    );
  });
});
