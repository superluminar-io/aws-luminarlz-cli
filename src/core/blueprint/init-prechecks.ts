import * as ssm from '@aws-sdk/client-ssm';
import { ParameterNotFound } from '@aws-sdk/client-ssm';
import { GLOBAL_REGION } from '../../config';

/**
 * Checks whether the LZA/Control Tower rollout is complete by verifying
 * that the AWSAccelerator-FinalizeStack SSM parameter exists in the global region (us-east-1).
 *
 * The FinalizeStack always deploys to us-east-1 regardless of the user-supplied --region,
 * which is why this check is intentionally scoped to GLOBAL_REGION.
 *
 * @param managementAccountId - The AWS management account ID.
 * @returns `true` if the FinalizeStack SSM parameter exists and has a value, `false` if not found.
 * @throws If the SSM call fails for a reason other than ParameterNotFound.
 */
export const isLzaRolloutComplete = async (
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
