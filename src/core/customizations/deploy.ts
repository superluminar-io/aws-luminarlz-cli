import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStacksCommand,
  UpdateStackCommand,
  waitUntilStackCreateComplete,
  waitUntilStackUpdateComplete,
} from '@aws-sdk/client-cloudformation';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { loadConfigSync } from '../../config';
import { readCustomizationsStackTemplateBody } from '../accelerator/repository/checkout';

export const customizationsDeployStack = async ({ accountId, region, stackName }: {
  accountId: string;
  region: string;
  stackName: string;
}) => {
  const config = loadConfigSync();

  const templateBody = readCustomizationsStackTemplateBody({
    accountId: accountId,
    region: region,
    stackName: stackName,
  });

  const client = cloudFormationClient({
    managementAccountId: config.managementAccountId,
    accountId: accountId,
    region: region,
  });
  let stackExists = true;
  let describeStackOutput;
  try {
    describeStackOutput = await client.send(
      new DescribeStacksCommand({
        StackName: stackName,
      }),
    );
  } catch {
    stackExists = false;
  }

  if (
    describeStackOutput?.Stacks?.length &&
    describeStackOutput.Stacks.length > 1
  ) {
    throw new Error('More than one stack found with the same name');
  }

  if (stackExists) {
    try {
      await client.send(
        new UpdateStackCommand({
          StackName: stackName,
          TemplateBody: templateBody,
          Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
          RoleARN: `arn:aws:iam::${accountId}:role/cdk-accel-cfn-exec-role-${accountId}-${region}`,
        }),
      );
      await waitUntilStackUpdateComplete(
        {
          client,
          maxWaitTime: 300,
        },
        {
          StackName: stackName,
        },
      );
    } catch (error) {
      // if Validation Error: No updates are to be performed. then ignore
      if (
        error instanceof Error &&
        error.message.includes('No updates are to be performed')
      ) {
        console.log('No updates are to be performed');
      } else {
        throw error;
      }
    }
  } else {
    await client.send(
      new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
        Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
        RoleARN: `arn:aws:iam::${accountId}:role/cdk-accel-cfn-exec-role-${accountId}-${region}`,
      }),
    );
    await waitUntilStackCreateComplete(
      {
        client,
        maxWaitTime: 300,
      },
      {
        StackName: stackName,
      },
    );
  }
};

const cloudFormationClient = ({
  managementAccountId,
  region,
  accountId,
}: {
  managementAccountId: string;
  region: string;
  accountId: string;
}) => {
  return new CloudFormationClient({
    region,
    ...managementAccountId == accountId ? {} : {
      credentials: fromTemporaryCredentials({
        params: {
          RoleArn: `arn:aws:iam::${accountId}:role/AWSControlTowerExecution`,
        },
      }),
    },
  });
};