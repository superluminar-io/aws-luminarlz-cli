import {
  DescribeOrganizationConfigurationCommand,
  OrganizationConfigurationStatus,
  SecurityHubClient,
  UpdateOrganizationConfigurationCommand,
  UpdateOrganizationConfigurationCommandInput,
} from '@aws-sdk/client-securityhub';
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';
import { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';

function setRetryStrategy() {
  const numberOfRetries = Number(
    process.env.ACCELERATOR_SDK_MAX_ATTEMPTS ?? 800,
  );
  return new ConfiguredRetryStrategy(
    numberOfRetries,
    (attempt: number) => 100 + attempt * 1000,
  );
}

const client = new SecurityHubClient({
  retryStrategy: setRetryStrategy(),
  customUserAgent: process.env.SOLUTION_ID,
});
export async function handler(
  event: CdkCustomResourceEvent,
): Promise<CdkCustomResourceResponse> {
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      return await updateOrganizationConfig();
    case 'Delete':
      // Do Nothing
      return {
        Status: 'SUCCESS',
      };
    default:
      throw new Error('Invalid request type');
  }
}
async function updateOrganizationConfig() {
  const input: UpdateOrganizationConfigurationCommandInput = {
    AutoEnable: false,
    AutoEnableStandards: 'NONE',
    OrganizationConfiguration: {
      ConfigurationType: 'CENTRAL',
    },
  };

  const command = new UpdateOrganizationConfigurationCommand(input);
  await client.send(command);

  // wait while status of DescribeOrganizationConfigurationCommand is pending
  let status: OrganizationConfigurationStatus | undefined = 'PENDING';
  while (!status || status === 'PENDING') {
    const { OrganizationConfiguration } = await client.send(
      new DescribeOrganizationConfigurationCommand({}),
    );
    status = OrganizationConfiguration?.Status;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (status === 'FAILED') {
    throw new Error('Organization Configuration update failed');
  }

  return {
    Status: 'SUCCESS',
  };
}
