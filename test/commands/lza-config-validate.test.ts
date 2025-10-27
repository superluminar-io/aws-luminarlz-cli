import path from 'path';
import { DescribeOrganizationCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Init } from '../../src/commands/init';
import { LzaConfigValidate } from '../../src/commands/lza-config-validate';
import {
  AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME, LZA_SOURCE_PATH, loadConfigSync,
  LZA_REPOSITORY_GIT_URL, awsAcceleratorInstallerRepositoryBranchName,
} from '../../src/config';
import { getCheckoutPath } from '../../src/core/accelerator/repository/checkout';
import * as execModule from '../../src/core/util/exec';
import { createCliFor, runCli } from '../test-helper/cli';
import { useTempDir } from '../test-helper/use-temp-dir';

let temp: ReturnType<typeof useTempDir>;
describe('LZA Config Validate command', () => {
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

  it('should synthesize and validate after initializing a project with the specified blueprint', async () => {
    const cli = createCliFor(Init, LzaConfigValidate);

    await runCli(cli, [
      'init',
      '--blueprint', 'foundational',
      '--accounts-root-email', 'test@example.com',
      '--region', 'us-east-1',
      '--force',
    ], temp);
    await execModule.executeCommand('npm install', { cwd: temp.directory });
    await runCli(cli, ['lza', 'config', 'validate'], temp);

    const checkoutPath = getCheckoutPath();
    const config = loadConfigSync();
    const checkoutBranch = awsAcceleratorInstallerRepositoryBranchName(config);
    expect(config).toHaveCreatedCdkTemplates({ baseDir: temp.directory });
    expect(execSpy).toHaveBeenCalledInOrderWith(
      `git clone --depth=1 --branch ${checkoutBranch} ${LZA_REPOSITORY_GIT_URL} ${checkoutPath}`,
      [
        'yarn && yarn build',
        { cwd: path.join(checkoutPath, LZA_SOURCE_PATH) },
      ],
    );
  });
});
