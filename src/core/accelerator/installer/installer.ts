import {
  CloudFormationClient,
  DescribeStacksCommand,
  UpdateStackCommand,
  waitUntilStackUpdateComplete,
} from '@aws-sdk/client-cloudformation';
import * as ssm from '@aws-sdk/client-ssm';
import { ParameterNotFound } from '@aws-sdk/client-ssm';
import {
  AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
  awsAcceleratorInstallerRepositoryBranchName,
  awsAcceleratorInstallerStackTemplateUrl,
  Config,
  loadConfigSync,
} from '../../../config';

const describeInstallerStack = async (client: CloudFormationClient, config: Config) => {
  const describeStacksResult = await client.send(new DescribeStacksCommand({
    StackName: config.awsAcceleratorInstallerStackName,
  }));
  if (describeStacksResult.Stacks?.length !== 1) {
    throw new Error(`Stack ${config.awsAcceleratorInstallerStackName} not found or multiple stacks found.`);
  }
  return describeStacksResult.Stacks[0];
};

const cloudformationClient = (config: Config) => {
  return new CloudFormationClient({
    region: config.homeRegion,
  });
};

export const getVersion = async (region: string) => {
  const client = new ssm.SSMClient({ region: region });
  try {
    const result = await client.send(new ssm.GetParameterCommand({
      Name: AWS_ACCELERATOR_INSTALLER_STACK_VERSION_SSM_PARAMETER_NAME,
    }));
    if (result.Parameter?.Value) {
      return result.Parameter.Value;
    }
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      throw new Error(`AWS Accelerator version not found. Please check if the SSM parameter exists in the region: ${region}.`);
    }
    throw error;
  }
  throw new Error('AWS Accelerator version not found');
};

export const checkVersion = async () => {
  const config = loadConfigSync();
  const installerVersion = await getVersion(config.homeRegion);
  if (installerVersion !== config.awsAcceleratorVersion) {
    throw new Error(`
      AWS Accelerator version mismatch.
      The CLI should have the same version configured as the installed AWS Accelerator.
      Installed version: ${installerVersion}
      Configured version: ${config.awsAcceleratorVersion}
    `);
  }
  return installerVersion;
};

export const updateVersion = async () => {
  const config = loadConfigSync();
  const installerVersion = await getVersion(config.homeRegion);

  if (config.awsAcceleratorVersion < installerVersion) {
    throw new Error(`Version mismatch. Expected ${config.awsAcceleratorVersion} cannot be smaller than ${installerVersion}`);
  }
  if (config.awsAcceleratorVersion === installerVersion) {
    console.log(`Installer version: ${installerVersion} is already up to date`);
    return;
  }
  const client = cloudformationClient(config);
  await client.send(new UpdateStackCommand({
    StackName: config.awsAcceleratorInstallerStackName,
    Parameters: (await describeInstallerStack(client, config)).Parameters?.map((parameter) => {
      if (parameter.ParameterKey === 'RepositoryBranchName') {
        return {
          ParameterKey: parameter.ParameterKey,
          ParameterValue: awsAcceleratorInstallerRepositoryBranchName(config),
        };
      }
      return {
        ParameterKey: parameter.ParameterKey,
        UsePreviousValue: true,
      };
    }),
    TemplateURL: awsAcceleratorInstallerStackTemplateUrl(config),
    Capabilities: ['CAPABILITY_IAM'],
  }));
  await waitUntilStackUpdateComplete(
    {
      client,
      maxWaitTime: 300,
    },
    {
      StackName: config.awsAcceleratorInstallerStackName,
    },
  );
  console.log('You need to manually check that both accelerator pipelines succeed:\nhttps://console.aws.amazon.com/codesuite/codepipeline/pipelines?pipelines-meta=eyJmIjp7InRleHQiOiJBV1NBY2NlbGVyYXRvciJ9LCJzIjp7InByb3BlcnR5IjoidXBkYXRlZCIsImRpcmVjdGlvbiI6LTF9LCJuIjozMCwiaSI6MH0');
};