import { CloudTrailClient, DescribeTrailsCommand } from '@aws-sdk/client-cloudtrail';
import { mockClient } from 'aws-sdk-client-mock';
import { TEST_ACCOUNT_ID, TEST_REGION } from './constants';
import { resolveControlTowerCloudTrailLogGroupName } from '../src/core/accelerator/config/cloudtrail';

describe('resolveControlTowerCloudTrailLogGroupName', () => {
  const cloudTrailMock = mockClient(CloudTrailClient);

  beforeEach(() => {
    cloudTrailMock.reset();
    jest.clearAllMocks();
  });

  it('should resolve the organization Control Tower log group name', async () => {
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: logGroupArn('aws-controltower/CloudTrailLogs-org'),
        },
      ],
    });

    await expect(resolveControlTowerCloudTrailLogGroupName(TEST_REGION))
      .resolves
      .toBe('aws-controltower/CloudTrailLogs-org');
  });

  it('should strip the CloudWatch wildcard suffix from the resolved log group name', async () => {
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: logGroupArn('aws-controltower/CloudTrailLogs-xyz'),
        },
      ],
    });

    await expect(resolveControlTowerCloudTrailLogGroupName(TEST_REGION))
      .resolves
      .toBe('aws-controltower/CloudTrailLogs-xyz');
  });

  it('should request trails without shadow trails', async () => {
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: logGroupArn('aws-controltower/CloudTrailLogs-org'),
        },
      ],
    });

    await resolveControlTowerCloudTrailLogGroupName(TEST_REGION);

    expect(cloudTrailMock).toHaveReceivedCommandWith(DescribeTrailsCommand, {
      includeShadowTrails: false,
    });
  });

  it('should throw when no matching organization Control Tower trail exists', async () => {
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: false,
          CloudWatchLogsLogGroupArn: logGroupArn('aws-controltower/CloudTrailLogs-member'),
        },
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: logGroupArn('custom/log-group'),
        },
      ],
    });

    await expect(resolveControlTowerCloudTrailLogGroupName(TEST_REGION))
      .rejects
      .toThrow(`Unable to find a Control Tower CloudTrail log group in ${TEST_REGION}.`);
  });

  it('should throw when matching trail arn does not contain a log-group marker', async () => {
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: `arn:aws:logs:${TEST_REGION}:${TEST_ACCOUNT_ID}:destination:aws-controltower/CloudTrailLogs-org`,
        },
      ],
    });

    await expect(resolveControlTowerCloudTrailLogGroupName(TEST_REGION))
      .rejects
      .toThrow(`Unable to find a Control Tower CloudTrail log group in ${TEST_REGION}.`);
  });
});

const logGroupArn = (logGroupName: string): string =>
  `arn:aws:logs:${TEST_REGION}:${TEST_ACCOUNT_ID}:log-group:${logGroupName}:*`;
