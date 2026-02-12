import fs from 'node:fs';
import path from 'node:path';
import { CloudTrailClient, DescribeTrailsCommand } from '@aws-sdk/client-cloudtrail';
import { loadConfigSync } from '../../../config';
import { resolveProjectPath } from '../../util/path';

const AUTO_LOG_GROUP_PLACEHOLDER = '__AUTO__';
const SECURITY_CONFIG_FILE = 'security-config.yaml';

const CONTROL_TOWER_LOG_GROUP_PREFIX = 'aws-controltower/CloudTrailLogs';

type TrailEntry = { trail: { IsOrganizationTrail?: boolean }; logGroupName: string };
type SelectionRule = {
  name: string;
  matches: (entry: TrailEntry) => boolean;
};

const logGroupSelectionOrder: SelectionRule[] = [
  {
    name: 'Organization trail with Control Tower prefix',
    matches: (entry) =>
      entry.trail.IsOrganizationTrail === true &&
      entry.logGroupName.startsWith(CONTROL_TOWER_LOG_GROUP_PREFIX),
  },
  {
    name: 'Any trail with Control Tower prefix',
    matches: (entry) =>
      entry.logGroupName.startsWith(CONTROL_TOWER_LOG_GROUP_PREFIX),
  },
  {
    name: 'Any organization trail',
    matches: (entry) => entry.trail.IsOrganizationTrail === true,
  },
];

const parseLogGroupName = (arn: string): string | null => {
  const marker = ':log-group:';
  const index = arn.indexOf(marker);
  if (index === -1) {
    return null;
  }
  const name = arn.slice(index + marker.length).replace(/:\*$/, '');
  return name || null;
};

const extractTrailLogGroups = (trails: Array<{ CloudWatchLogsLogGroupArn?: string; IsOrganizationTrail?: boolean }>): TrailEntry[] => {
  const candidates: TrailEntry[] = [];
  for (const trail of trails) {
    const arn = trail.CloudWatchLogsLogGroupArn;
    if (!arn) {
      continue;
    }
    const logGroupName = parseLogGroupName(arn);
    if (!logGroupName) {
      continue;
    }
    candidates.push({ trail, logGroupName });
  }
  return candidates;
};

const selectLogGroupName = (trailCandidates: TrailEntry[], matchOrder: SelectionRule[]): string | null => {
  const selectedRule = matchOrder.find((rule) => trailCandidates.some(rule.matches));
  const selectedTrail = selectedRule ? trailCandidates.find(selectedRule.matches) : null;
  if (!selectedTrail) {
    return null;
  }
  return selectedTrail.logGroupName;
};

const resolveCloudTrailLogGroupName = async (region: string): Promise<string> => {
  const client = new CloudTrailClient({ region });
  const response = await client.send(new DescribeTrailsCommand({
    includeShadowTrails: false,
  }));
  const trails = response.trailList || [];
  const trailsWithLogGroup = extractTrailLogGroups(trails);

  const preferredLogGroup = selectLogGroupName(trailsWithLogGroup, logGroupSelectionOrder);
  if (preferredLogGroup) {
    return preferredLogGroup;
  }

  if (trailsWithLogGroup.length === 0) {
    throw new Error(`Unable to resolve the Control Tower CloudTrail log group in ${region}.`);
  }

  return trailsWithLogGroup[0].logGroupName;
};

const buildMissingConfigError = (region: string, originalError: Error): Error => {
  const message =
    `Unable to resolve the Control Tower CloudTrail log group in ${region}. ` +
    'Set cloudTrailLogGroupName explicitly in config.ts and re-run deploy.';

  return new Error(`${message} Cause: ${originalError.message}`);
};

const toError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
};

const replaceAutoPlaceholder = (contents: string, value: string): string => {
  return contents.split(AUTO_LOG_GROUP_PLACEHOLDER).join(value);
};

const resolveSecurityConfigPath = (configOutDir: string): string => {
  return path.join(configOutDir, SECURITY_CONFIG_FILE);
};

const readSecurityConfig = (configOutDir: string, configOutPathForError: string): string => {
  const securityConfigPath = resolveSecurityConfigPath(configOutDir);
  if (!fs.existsSync(securityConfigPath)) {
    throw new Error(
      `Expected ${SECURITY_CONFIG_FILE} in ${configOutPathForError}. Run synth before deploy.`,
    );
  }
  return fs.readFileSync(securityConfigPath, 'utf8');
};

const writeSecurityConfig = (configOutDir: string, contents: string): void => {
  const securityConfigPath = resolveSecurityConfigPath(configOutDir);
  fs.writeFileSync(securityConfigPath, contents);
};

export const applyAutoCloudTrailLogGroupName = async (): Promise<void> => {
  const config = loadConfigSync();
  if (config.cloudTrailLogGroupName !== AUTO_LOG_GROUP_PLACEHOLDER) {
    return;
  }

  const acceleratorConfigOutDir = resolveProjectPath(config.awsAcceleratorConfigOutPath);
  const securityConfigContents = readSecurityConfig(
    acceleratorConfigOutDir,
    config.awsAcceleratorConfigOutPath,
  );
  if (!securityConfigContents.includes(AUTO_LOG_GROUP_PLACEHOLDER)) {
    return;
  }

  let logGroupName: string;
  try {
    logGroupName = await resolveCloudTrailLogGroupName(config.homeRegion);
  } catch (error) {
    throw buildMissingConfigError(config.homeRegion, toError(error));
  }

  const updated = replaceAutoPlaceholder(securityConfigContents, logGroupName);
  writeSecurityConfig(acceleratorConfigOutDir, updated);
};
