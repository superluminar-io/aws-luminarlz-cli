import {
  GetParameterCommand,
  ParameterNotFound,
  SSMClient,
} from '@aws-sdk/client-ssm';
import {
  AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
  loadConfigSync,
} from '../../../config';

const ENABLED_VALUE = 'true';

export const isPendingDeployFlowEnabled = async ({ region }: {
  region?: string;
} = {}): Promise<boolean> => {
  const resolvedRegion = region ?? loadConfigSync().homeRegion;
  const client = new SSMClient({ region: resolvedRegion });

  try {
    const response = await client.send(new GetParameterCommand({
      Name: AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
    }));
    return response.Parameter?.Value?.toLowerCase() === ENABLED_VALUE;
  } catch (error) {
    if (
      error instanceof ParameterNotFound ||
      (error instanceof Error && error.name === 'ParameterNotFound')
    ) {
      return false;
    }
    throw error;
  }
};
