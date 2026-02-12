import fs from 'node:fs';
import path from 'node:path';
import { CloudTrailClient, DescribeTrailsCommand } from '@aws-sdk/client-cloudtrail';
import { mockClient } from 'aws-sdk-client-mock';
import { TEST_REGION, TEST_ACCOUNT_ID } from './constants';
import { baseConfig, Config } from '../src/config';
import * as configModule from '../src/config';
import { useTempDir } from './test-helper/use-temp-dir';
import { applyAutoCloudTrailLogGroupName } from '../src/core/accelerator/config/cloudtrail';
import * as pathModule from '../src/core/util/path';

const AUTO_PLACEHOLDER = '__AUTO__';

describe('CloudTrail auto log group resolution', () => {
  const cloudTrailMock = mockClient(CloudTrailClient);
  let temp: ReturnType<typeof useTempDir>;

  beforeEach(() => {
    temp = useTempDir();
    cloudTrailMock.reset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    temp.restore();
    jest.restoreAllMocks();
  });

  it('should skip trail lookup when security config has no placeholder', async () => {
    arrangeConfig(AUTO_PLACEHOLDER, 'manually-set-log-group');

    await actApply();

    expect(cloudTrailMock).not.toHaveReceivedCommand(DescribeTrailsCommand);
    expect(readSecurityConfig()).toContain('manually-set-log-group');
  });

  it('should skip all work when config cloudTrailLogGroupName is not auto', async () => {
    arrangeConfig('already-configured-value', 'explicit-log-group');

    await actApply();

    expect(cloudTrailMock).not.toHaveReceivedCommand(DescribeTrailsCommand);
    expect(readSecurityConfig()).toContain('explicit-log-group');
  });

  it('should preserve original error context when trail lookup fails', async () => {
    arrangeConfig(AUTO_PLACEHOLDER);
    cloudTrailMock.on(DescribeTrailsCommand).rejects(new Error('AccessDeniedException'));

    await expect(actApply()).rejects.toThrow('Cause: AccessDeniedException');
  });

  it('should replace placeholder when exactly one Control Tower log group exists', async () => {
    arrangeConfig(AUTO_PLACEHOLDER);
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: logGroupArn('aws-controltower/CloudTrailLogs-xyz'),
        },
      ],
    });

    await actApply();

    expect(readSecurityConfig()).toContain('aws-controltower/CloudTrailLogs-xyz');
  });

  it('should prefer the single organization Control Tower trail when multiple Control Tower trails exist', async () => {
    arrangeConfig(AUTO_PLACEHOLDER);
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: false,
          CloudWatchLogsLogGroupArn: logGroupArn('aws-controltower/CloudTrailLogs-member'),
        },
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: logGroupArn('aws-controltower/CloudTrailLogs-org'),
        },
      ],
    });

    await actApply();

    expect(readSecurityConfig()).toContain('aws-controltower/CloudTrailLogs-org');
  });

  it('should fail when no Control Tower log group can be resolved', async () => {
    arrangeConfig(AUTO_PLACEHOLDER);
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: logGroupArn('custom/cloudtrail/log-group'),
        },
      ],
    });

    await expect(actApply()).rejects.toThrow(
      `Unable to resolve the Control Tower CloudTrail log group in ${TEST_REGION}.`,
    );
  });

  it('should fail when multiple Control Tower candidates remain ambiguous', async () => {
    arrangeConfig(AUTO_PLACEHOLDER);
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: false,
          CloudWatchLogsLogGroupArn: logGroupArn('aws-controltower/CloudTrailLogs-a'),
        },
        {
          IsOrganizationTrail: false,
          CloudWatchLogsLogGroupArn: logGroupArn('aws-controltower/CloudTrailLogs-b'),
        },
      ],
    });

    await expect(actApply()).rejects.toThrow('Found multiple Control Tower CloudTrail log groups');
  });


  it('should strip the CloudWatch logs wildcard suffix from the resolved log group name', async () => {
    arrangeConfig(AUTO_PLACEHOLDER);
    cloudTrailMock.on(DescribeTrailsCommand).resolves({
      trailList: [
        {
          IsOrganizationTrail: true,
          CloudWatchLogsLogGroupArn: `arn:aws:logs:${TEST_REGION}:${TEST_ACCOUNT_ID}:log-group:aws-controltower/CloudTrailLogs-trim:*`,
        },
      ],
    });

    await actApply();

    expect(readSecurityConfig()).toContain('aws-controltower/CloudTrailLogs-trim');
    expect(readSecurityConfig()).not.toContain(':*');
  });

  it('should convert non-Error rejections into an error cause message', async () => {
    arrangeConfig(AUTO_PLACEHOLDER);
    cloudTrailMock.on(DescribeTrailsCommand).rejects('throttled');

    await expect(actApply()).rejects.toThrow('Cause: throttled');
  });

  it('should fail when security-config.yaml is missing', async () => {
    arrangeConfigWithoutSecurityFile(AUTO_PLACEHOLDER);

    await expect(actApply()).rejects.toThrow('Run synth before deploy');
  });

  const arrangeConfig = (cloudTrailLogGroupName: string, securityLogGroupValue: string = AUTO_PLACEHOLDER): void => {
    const configOutPath = baseConfig.awsAcceleratorConfigOutPath;
    const configOutDir = path.join(temp.directory, configOutPath);
    fs.mkdirSync(configOutDir, { recursive: true });

    fs.writeFileSync(
      path.join(configOutDir, 'security-config.yaml'),
      `logging:\n  cloudtrail:\n    cloudWatchLogsLogGroupArn: ${securityLogGroupValue}\n`,
      'utf8',
    );

    const config: Config = {
      ...baseConfig,
      cloudTrailLogGroupName,
      awsAcceleratorVersion: '1.14.2',
      environments: {},
      templates: [],
      managementAccountId: TEST_ACCOUNT_ID,
      homeRegion: TEST_REGION,
      enabledRegions: [TEST_REGION],
    };

    jest.spyOn(configModule, 'loadConfigSync').mockReturnValue(config);
    jest.spyOn(pathModule, 'resolveProjectPath').mockImplementation((input: string) => path.join(temp.directory, input));
  };


  const arrangeConfigWithoutSecurityFile = (cloudTrailLogGroupName: string): void => {
    const configOutPath = baseConfig.awsAcceleratorConfigOutPath;
    const configOutDir = path.join(temp.directory, configOutPath);
    fs.mkdirSync(configOutDir, { recursive: true });

    const config: Config = {
      ...baseConfig,
      cloudTrailLogGroupName,
      awsAcceleratorVersion: '1.14.2',
      environments: {},
      templates: [],
      managementAccountId: TEST_ACCOUNT_ID,
      homeRegion: TEST_REGION,
      enabledRegions: [TEST_REGION],
    };

    jest.spyOn(configModule, 'loadConfigSync').mockReturnValue(config);
    jest.spyOn(pathModule, 'resolveProjectPath').mockImplementation((input: string) => path.join(temp.directory, input));
  };

  const actApply = async (): Promise<void> => {
    await applyAutoCloudTrailLogGroupName();
  };

  const readSecurityConfig = (): string =>
    fs.readFileSync(path.join(temp.directory, baseConfig.awsAcceleratorConfigOutPath, 'security-config.yaml'), 'utf8');

  const logGroupArn = (logGroupName: string): string =>
    `arn:aws:logs:${TEST_REGION}:${TEST_ACCOUNT_ID}:log-group:${logGroupName}:*`;
});
