import {
  GetParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import {
  AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
} from '../../../../src/config';
import { isPendingDeployFlowEnabled } from '../../../../src/core/accelerator/pipeline/pending-flow';

describe('isPendingDeployFlowEnabled', () => {
  const ssmMock = mockClient(SSMClient);

  beforeEach(() => {
    ssmMock.reset();
  });

  it('should return true when the marker parameter is true', async () => {
    ssmMock.on(GetParameterCommand, {
      Name: AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
    }).resolves({
      Parameter: {
        Name: AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
        Value: 'true',
        Type: 'String',
      },
    });

    await expect(isPendingDeployFlowEnabled({ region: 'eu-central-1' })).resolves.toBe(true);
  });

  it('should return false when the marker parameter is missing', async () => {
    const parameterNotFound = new Error('ParameterNotFound');
    (parameterNotFound as Error & { name: string }).name = 'ParameterNotFound';
    ssmMock.on(GetParameterCommand, {
      Name: AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
    }).rejects(parameterNotFound);

    await expect(isPendingDeployFlowEnabled({ region: 'eu-central-1' })).resolves.toBe(false);
  });
});
