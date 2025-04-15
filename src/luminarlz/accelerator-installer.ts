import {
  CloudFormationClient,
  DescribeStacksCommand,
  UpdateStackCommand,
  waitUntilStackUpdateComplete,
} from '@aws-sdk/client-cloudformation';
import { Config, loadConfigSync } from '../config';

const REPOSITORY_BRANCH_NAME_PREFIX = 'release/v';

const describeInstallerStack = async (client: CloudFormationClient, config: Config) => {
  const describeStacksResult = await client.send(new DescribeStacksCommand({
    StackName: config.awsAcceleratorInstallerStackName,
  }));
  if (describeStacksResult.Stacks?.length !== 1) {
    throw new Error(`Stack ${config.awsAcceleratorInstallerStackName} not found or multiple stacks found.`);
  }
  return describeStacksResult.Stacks[0];
};

export const cloudformationClient = (config: Config) => {
  return new CloudFormationClient({
    region: config.homeRegion,
  });
};

const getInstallerVersion = async (client: CloudFormationClient) => {
  const config = loadConfigSync();
  const describeStacksResult = await describeInstallerStack(client, config);
  const repositoryBranchName = describeStacksResult.Parameters?.find((parameter => parameter.ParameterKey === 'RepositoryBranchName'))?.ParameterValue;
  if (!repositoryBranchName) {
    throw new Error(`Parameter RepositoryBranchName not found in stack ${config.awsAcceleratorInstallerStackName}`);
  }
  return repositoryBranchName.replace(REPOSITORY_BRANCH_NAME_PREFIX, '');
};

export const checkInstallerVersion = async () => {
  const config = loadConfigSync();
  const client = cloudformationClient(config);
  const installerVersion = await getInstallerVersion(client);
  if (installerVersion !== config.awsAcceleratorVersion) {
    throw new Error(`Version mismatch. Expected ${config.awsAcceleratorVersion}, found ${installerVersion}`);
  }
  return installerVersion;
};

export const updateInstallerVersion = async () => {
  const config = loadConfigSync();
  const client = cloudformationClient(config);
  const installerVersion = await getInstallerVersion(client);

  if (config.awsAcceleratorVersion < installerVersion) {
    throw new Error(`Version mismatch. Expected ${config.awsAcceleratorVersion} cannot be smaller than ${installerVersion}`);
  }
  if (config.awsAcceleratorVersion === installerVersion) {
    console.log(`Installer version: ${installerVersion} is already up to date`);
    return;
  }
  await client.send(new UpdateStackCommand({
    StackName: config.awsAcceleratorInstallerStackName,
    Parameters: (await describeInstallerStack(client, config)).Parameters?.map((parameter) => {
      if (parameter.ParameterKey === 'RepositoryBranchName') {
        return {
          ParameterKey: parameter.ParameterKey,
          ParameterValue: REPOSITORY_BRANCH_NAME_PREFIX + config.awsAcceleratorVersion,
        };
      }
      return {
        ParameterKey: parameter.ParameterKey,
        UsePreviousValue: true,
      };
    }),
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
};