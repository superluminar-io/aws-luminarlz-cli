import path from 'path';
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
import { createCliFor, runCli } from '../../src/test-helper/cli';
import { useTempDir } from '../../src/test-helper/use-temp-dir';

let temp: ReturnType<typeof useTempDir>;
describe('LZA Core Bootstrap command', () => {
  const ssmMock = mockClient(SSMClient);
  const stsMock = mockClient(STSClient);
  const organizationsMock = mockClient(OrganizationsClient);
  const ssoAdminMock = mockClient(SSOAdminClient);

  let execSpy: jest.SpyInstance;
  const realExecute = execModule.executeCommand;

  beforeEach(() => {
    temp = useTempDir();

    ssmMock.reset();
    stsMock.reset();
    organizationsMock.reset();
    ssoAdminMock.reset();
    jest.clearAllMocks();

    // Set up executeCommand spy with passthrough. Intercept only:
    // - git clone ... (avoid network)
    // - yarn && yarn build in LZA checkout (avoid building repo)
    // - yarn run ts-node --transpile-only cdk.ts synth ... (avoid running LZA synth)
    // - yarn run ts-node --transpile-only cdk.ts bootstrap ... (avoid running bootstrap)
    // Do NOT intercept `npx cdk synth` from customizationsCdkSynth
    execSpy = jest.spyOn(execModule, 'executeCommand').mockImplementation(((command: any, opts: any) => {
      if (typeof command === 'string') {
        if (command.startsWith('git clone ')) {
          return Promise.resolve({ stdout: '', stderr: '' } as any) as any;
        }
        if (command.startsWith('yarn')) {
          return Promise.resolve({ stdout: '', stderr: '' } as any) as any;
        }
      }
      return (realExecute as any)(command, opts);
    }) as any);

    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
        Value: '1.12.2',
        Type: 'String',
      },
    });

    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:role/Admin',
      UserId: 'AROAEXAMPLE123',
    });

    organizationsMock.on(DescribeOrganizationCommand).resolves({
      Organization: {
        Id: 'o-exampleorg',
        Arn: 'arn:aws:organizations::123456789012:organization/o-exampleorg',
        MasterAccountId: '123456789012',
      },
    });

    organizationsMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: 'r-exampleroot',
          Arn: 'arn:aws:organizations::123456789012:root/o-exampleorg/r-exampleroot',
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
  });

  afterAll(() => {
    temp.restore();
  });

  it('should synthesize, run accelerator synth, and bootstrap after initializing a project', async () => {
    const cli = createCliFor(Init, LzaCoreBootstrap);

    await runCli(cli, [
      'init',
      '--blueprint', 'foundational',
      '--accounts-root-email', 'test@example.com',
      '--region', 'us-east-1',
      '--force',
    ], temp);
    await execModule.executeCommand('npm install', { cwd: temp.dir });
    await runCli(cli, ['lza', 'core', 'bootstrap'], temp);

    const config = loadConfigSync();
    const checkoutPath = getCheckoutPath();
    const checkoutBranch = awsAcceleratorInstallerRepositoryBranchName(config);
    const lzaConfigPath = resolveProjectPath(
      config.awsAcceleratorConfigOutPath,
    );
    expect(config).toHaveCreatedCdkTemplates({ baseDir: temp.dir });
    expect(execSpy).toHaveBeenNthCalledWith(
      3,
      `git clone --depth=1 --branch ${checkoutBranch} ${LZA_REPOSITORY_GIT_URL} ${checkoutPath}`,
    );
    expect(execSpy).toHaveBeenNthCalledWith(
      4,
      'yarn && yarn build',
      { cwd: path.join(checkoutPath, LZA_SOURCE_PATH) },
    );
    expect(execSpy).toHaveBeenNthCalledWith(
      5,
      `yarn run ts-node --transpile-only cdk.ts synth --config-dir "${lzaConfigPath}" --partition aws`,
      { cwd: path.join(checkoutPath, LZA_ACCELERATOR_PACKAGE_PATH) },
    );
    expect(execSpy).toHaveBeenNthCalledWith(
      8,
      `yarn run ts-node --transpile-only cdk.ts bootstrap --require-approval never --config-dir "${lzaConfigPath}" --partition aws`,
      { cwd: path.join(checkoutPath, LZA_ACCELERATOR_PACKAGE_PATH) },
    );
  });
});
