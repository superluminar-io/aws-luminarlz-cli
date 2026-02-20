import { CloudTrailClient, DescribeTrailsCommand } from '@aws-sdk/client-cloudtrail';
import { Trail } from '@aws-sdk/client-cloudtrail/dist-types/models/models_0';

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
