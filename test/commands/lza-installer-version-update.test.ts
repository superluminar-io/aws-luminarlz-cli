import {
  CloudFormationClient,
  DescribeStacksCommand,
  UpdateStackCommand,
} from '@aws-sdk/client-cloudformation';
import { DescribeOrganizationCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { Init } from '../../src/commands/init';
import { LzaInstallerVersionUpdate } from '../../src/commands/lza-installer-version-update';
import {
  AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
  AWS_ACCELERATOR_INSTALLER_STACK_NAME,
} from '../../src/config';
import * as execModule from '../../src/core/util/exec';
import { CliError, createCliFor, runCli } from '../../src/test-helper/cli';
import { useTempDir } from '../../src/test-helper/use-temp-dir';

let temp: ReturnType<typeof useTempDir>;

/**
 * Integration-style tests for `lza installer-version update`.
 * We only mock AWS SDK client calls and keep filesystem real.
 */
describe('LZA Installer Version - update command', () => {
  const ssmMock = mockClient(SSMClient);
  const cfnMock = mockClient(CloudFormationClient);
  const stsMock = mockClient(STSClient);
  const organizationsMock = mockClient(OrganizationsClient);
  const ssoAdminMock = mockClient(SSOAdminClient);

  beforeEach(() => {
    temp = useTempDir();

    ssmMock.reset();
    cfnMock.reset();
    stsMock.reset();
    organizationsMock.reset();
    ssoAdminMock.reset();
    jest.clearAllMocks();

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
        { Id: 'r-exampleroot', Arn: 'arn:aws:organizations::123456789012:root/o-exampleorg/r-exampleroot', Name: 'Root' },
      ],
    });
    ssoAdminMock.on(ListInstancesCommand).resolves({
      Instances: [
        { InstanceArn: 'arn:aws:sso:::instance/ssoins-example', IdentityStoreId: 'd-example123' },
      ],
    });
  });

  afterEach(() => {
    temp.cleanup();
  });

  it('should be a no-op when installed version is already up to date', async () => {
    // Installed version equals configured version (1.12.2)
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
        Value: '1.12.2',
        Type: 'String',
      },
    });
    const cli = createCliFor(Init, LzaInstallerVersionUpdate);

    await runCli(cli, [
      'init',
      '--blueprint', 'foundational',
      '--accounts-root-email', 'test@example.com',
      '--region', 'us-east-1',
      '--force',
    ], temp);
    await execModule.executeCommand('npm install', { cwd: temp.dir });
    await runCli(cli, ['lza', 'installer-version', 'update'], temp);

    expect(cfnMock).toHaveReceivedCommandTimes(UpdateStackCommand, 0);
  });

  it('should trigger a CloudFormation update when configured version is newer than installed', async () => {
    // Init sees 1.12.2, then update sees 1.12.1 (older)
    ssmMock.on(GetParameterCommand)
      .resolvesOnce({
        Parameter: {
          Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
          Value: '1.12.2',
          Type: 'String',
        },
      })
      .resolves({
        Parameter: {
          Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
          Value: '1.12.1',
          Type: 'String',
        },
      });
    // Mock UpdateStack to succeed
    cfnMock.on(UpdateStackCommand).resolves({ StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/AWSAccelerator-InstallerStack/1' } as any);
    // First DescribeStacks call (reading existing parameters)
    cfnMock.on(DescribeStacksCommand).resolvesOnce({
      Stacks: [
        {
          StackName: AWS_ACCELERATOR_INSTALLER_STACK_NAME,
          Parameters: [
            { ParameterKey: 'RepositoryBranchName', ParameterValue: 'release/v1.12.1' },
            { ParameterKey: 'Foo', ParameterValue: 'Bar' },
          ],
        } as any,
      ],
    });
    // Default waiter polling responses: always UPDATE_COMPLETE so waiter returns quickly
    cfnMock.on(DescribeStacksCommand).resolves({
      Stacks: [{ StackName: AWS_ACCELERATOR_INSTALLER_STACK_NAME, StackStatus: 'UPDATE_COMPLETE' } as any],
    });

    const cli = createCliFor(Init, LzaInstallerVersionUpdate);
    await runCli(cli, [
      'init',
      '--blueprint', 'foundational',
      '--accounts-root-email', 'test@example.com',
      '--region', 'us-east-1',
      '--force',
    ], temp);
    await execModule.executeCommand('npm install', { cwd: temp.dir });
    await runCli(cli, ['lza', 'installer-version', 'update'], temp);

    expect(cfnMock).toHaveReceivedCommandTimes(UpdateStackCommand, 1);
    expect(cfnMock).toHaveReceivedCommandWith(UpdateStackCommand, {
      StackName: AWS_ACCELERATOR_INSTALLER_STACK_NAME,
      TemplateURL: 'https://s3.amazonaws.com/solutions-reference/landing-zone-accelerator-on-aws/v1.12.2/AWSAccelerator-InstallerStack.template',
      Capabilities: expect.arrayContaining(['CAPABILITY_IAM']),
    });
  });

  it('should fail when configured version is smaller than installed version', async () => {
    // Init sees 1.12.2, then update sees newer 1.12.3
    ssmMock.on(GetParameterCommand)
      .resolvesOnce({
        Parameter: {
          Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
          Value: '1.12.2',
          Type: 'String',
        },
      })
      .resolves({
        Parameter: {
          Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
          Value: '1.12.3',
          Type: 'String',
        },
      });

    const cli = createCliFor(Init, LzaInstallerVersionUpdate);
    await runCli(cli, [
      'init',
      '--blueprint', 'foundational',
      '--accounts-root-email', 'test@example.com',
      '--region', 'us-east-1',
      '--force',
    ], temp);
    await execModule.executeCommand('npm install', { cwd: temp.dir });

    await expect(runCli(cli, ['lza', 'installer-version', 'update'], temp)).rejects.toThrow(CliError);
    expect(cfnMock).toHaveReceivedCommandTimes(UpdateStackCommand, 0);
  });
});
