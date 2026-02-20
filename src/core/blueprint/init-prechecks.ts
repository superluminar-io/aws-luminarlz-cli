import * as ssm from '@aws-sdk/client-ssm';
import { ParameterNotFound } from '@aws-sdk/client-ssm';
import { GLOBAL_REGION } from './../../config';

export const isControlTowerRolloutComplete = async (
  managementAccountId: string,
): Promise<boolean> => {
  const finalizeStackParameterName = `/accelerator/AWSAccelerator-FinalizeStack-${managementAccountId}-${GLOBAL_REGION}/version`;
  const globalRegionSSMClient = new ssm.SSMClient({ region: GLOBAL_REGION });
  try {
    const commandOutput = await globalRegionSSMClient.send(new ssm.GetParameterCommand({ Name: finalizeStackParameterName }));
    if (commandOutput.Parameter?.Value) {
      return true;
    }
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      return false;
    }
    throw error;
  }
  return false;
};
