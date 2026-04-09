import { CloudTrailClient, DescribeTrailsCommand, Trail } from '@aws-sdk/client-cloudtrail';

const CONTROL_TOWER_LOG_GROUP_PREFIX = 'aws-controltower/CloudTrailLogs';

const parseLogGroupName = (arn: string): string | null => {
  const marker = ':log-group:';
  const index = arn.indexOf(marker);
  if (index === -1) {
    return null;
  }
  const name = arn.slice(index + marker.length).replace(/:\*$/, '');
  return name || null;
};

const findControlTowerLogGroupName = (trails: Trail[]): string | null => {
  const organizationTrail = trails.find(trailEntry =>
    trailEntry.CloudWatchLogsLogGroupArn?.includes(CONTROL_TOWER_LOG_GROUP_PREFIX) && trailEntry.IsOrganizationTrail,
  );
  if (!organizationTrail || !organizationTrail.CloudWatchLogsLogGroupArn) {
    return null;
  }

  return parseLogGroupName(organizationTrail.CloudWatchLogsLogGroupArn);
};

/**
 * Resolves the Control Tower CloudTrail log group name from the given region.
 *
 * The `region` parameter should be the Control Tower home region, as that is
 * where the organization-level CloudTrail trail is created. Passing a different
 * region will result in an error if no matching trail is found there.
 *
 * @param region - The AWS region to look up the Control Tower CloudTrail trail in (should be the CT home region).
 * @returns The CloudWatch log group name associated with the Control Tower organization trail.
 * @throws If no matching organization trail with a Control Tower log group is found.
 */
export const resolveControlTowerCloudTrailLogGroupName = async (region: string): Promise<string> => {
  const cloudTrailClient = new CloudTrailClient({ region });
  const commandOutput = await cloudTrailClient.send(new DescribeTrailsCommand({
    includeShadowTrails: false,
  }));
  const trails = commandOutput.trailList || [];
  const controlTowerLogGroupName = findControlTowerLogGroupName(trails);
  if (controlTowerLogGroupName === null) {
    throw new Error(`Unable to find a Control Tower CloudTrail log group in ${region}.`);
  }
  return controlTowerLogGroupName;
};
