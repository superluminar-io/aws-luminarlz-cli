import * as ssm from '@aws-sdk/client-ssm';

const ACCELERATOR_PREFIX_SSM_PARAMETER_NAME = '/accelerator/lza-prefix';
const COMMERCIAL_GLOBAL_REGION = 'us-east-1';
const GOVERNMENT_GLOBAL_REGION = 'us-gov-west-1';
const CHINA_GLOBAL_REGION = 'cn-northwest-1';

type ParameterLookupError = Error & {
  name: string;
  Code?: string;
  code?: string;
  message: string;
};

const toFinalizeStackVersionSsmParameterName = (
  acceleratorPrefix: string,
  accountId: string,
  region: string,
): string => {
  const oneWordPrefix = acceleratorPrefix.toLowerCase() === 'awsaccelerator'
    ? 'accelerator'
    : acceleratorPrefix;
  return `/${oneWordPrefix}/${acceleratorPrefix}-FinalizeStack-${accountId}-${region}/version`;
};

const resolveGlobalRegionForHomeRegion = (region: string): string => {
  if (region.startsWith('cn-')) {
    return CHINA_GLOBAL_REGION;
  }
  if (region.startsWith('us-gov-')) {
    return GOVERNMENT_GLOBAL_REGION;
  }
  return COMMERCIAL_GLOBAL_REGION;
};

type FinalizeMarkerCandidate = {
  region: string;
  parameterName: string;
};

const toFinalizeStackVersionCandidates = (
  acceleratorPrefix: string,
  accountId: string,
  homeRegion: string,
): FinalizeMarkerCandidate[] => {
  const globalRegion = resolveGlobalRegionForHomeRegion(homeRegion);
  const regions = homeRegion === globalRegion
    ? [homeRegion]
    : [homeRegion, globalRegion];

  return regions.map(region => ({
    region,
    parameterName: toFinalizeStackVersionSsmParameterName(acceleratorPrefix, accountId, region),
  }));
};

const toParameterLookupError = (error: unknown): ParameterLookupError | null => {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      name?: string;
      Code?: string;
      code?: string;
      message?: string;
    };
    return {
      name: candidate.name ?? '',
      Code: candidate.Code,
      code: candidate.code,
      message: candidate.message ?? '',
    };
  }
  return null;
};

const isParameterNotFound = (error: unknown): boolean => {
  const normalizedError = toParameterLookupError(error);
  if (!normalizedError) {
    return false;
  }
  const name = normalizedError.name ?? '';
  const code = normalizedError.Code ?? normalizedError.code ?? '';
  const message = normalizedError.message;
  const normalizedMessage = message.toLowerCase();

  return name === 'ParameterNotFound'
    || code === 'ParameterNotFound'
    || message.includes('ParameterNotFound')
    || normalizedMessage.includes('parameter not found');
};

const readRequiredSsmStringParameter = async (
  client: ssm.SSMClient,
  parameterName: string,
  missingMessage: string,
): Promise<string> => {
  try {
    const result = await client.send(new ssm.GetParameterCommand({ Name: parameterName }));
    const value = result.Parameter?.Value;
    if (!value) {
      throw new Error(`SSM parameter ${parameterName} is empty.`);
    }
    return value;
  } catch (error) {
    if (isParameterNotFound(error)) {
      throw new Error(missingMessage);
    }
    throw error;
  }
};

const readAcceleratorPrefixSsmParameter = async (client: ssm.SSMClient): Promise<string> => {
  return readRequiredSsmStringParameter(
    client,
    ACCELERATOR_PREFIX_SSM_PARAMETER_NAME,
    `Missing required SSM parameter ${ACCELERATOR_PREFIX_SSM_PARAMETER_NAME}. ` +
    'Control Tower/LZA initial rollout does not look complete yet. ' +
    'Finish the initial rollout before running init.',
  );
};

const assertFinalizeStackVersionMarkerExists = async (
  homeRegion: string,
  managementAccountId: string,
  acceleratorPrefix: string,
): Promise<void> => {
  const finalizeVersionCandidates = toFinalizeStackVersionCandidates(
    acceleratorPrefix,
    managementAccountId,
    homeRegion,
  );
  for (const candidate of finalizeVersionCandidates) {
    const parameterName = candidate.parameterName;
    const region = candidate.region;
    const regionalClient = new ssm.SSMClient({ region });
    try {
      const result = await regionalClient.send(new ssm.GetParameterCommand({ Name: parameterName }));
      const value = result.Parameter?.Value;
      if (!value) {
        throw new Error(`SSM parameter ${parameterName} is empty.`);
      }
      return;
    } catch (error) {
      if (!isParameterNotFound(error)) {
        throw error;
      }
    }
  }

  throw new Error(
    `Missing required finalize marker parameter. Checked ${finalizeVersionCandidates.map(candidate => candidate.parameterName).join(', ')}. ` +
    'Control Tower/LZA initial rollout is not complete yet. ' +
    'Finish rollout before running init.',
  );
};

export const assertInitControlTowerPrerequisites = async (
  region: string,
  managementAccountId: string,
): Promise<void> => {
  const client = new ssm.SSMClient({ region });
  const acceleratorPrefix = await readAcceleratorPrefixSsmParameter(client);
  await assertFinalizeStackVersionMarkerExists(region, managementAccountId, acceleratorPrefix);
};
