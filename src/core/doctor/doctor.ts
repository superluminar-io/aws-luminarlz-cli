import * as fs from 'node:fs';
import * as path from 'node:path';
import { AwsChecksProvider } from './aws-checks-provider';
import { DoctorRunner } from './doctor-runner';
import { FixtureChecksProvider } from './fixture-checks-provider';
import { baseConfig, Config, loadConfigSync } from '../../config';

export enum CheckStatus {
  OK = 'ok',
  FAIL = 'fail',
}

export interface DoctorOptions {
  fixturesPath?: string;
  only?: string[];
}

export interface DoctorFixture {
  accountId: string;
  homeRegion: string;
  installerVersion: string;
  awsAcceleratorVersion?: string;
  managementAccountId?: string;
  enabledRegions?: string[];
  lzaCheckoutExists?: boolean;
  lzaCheckoutBranch?: string;
  installerStackExists: boolean;
  configBucketExists: boolean;
  cdkAssetsBuckets: Record<string, boolean>;
}

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  details?: string;
  fix?: string;
}

export interface DoctorSummary {
  results: CheckResult[];
  hasFailures: boolean;
}

export const runDoctor = async (options: DoctorOptions = {}): Promise<DoctorSummary> => {
  if (options.fixturesPath) {
    const summary = await runWithFixtures(options.fixturesPath);
    return applyOnlyFilter(summary, options.only);
  }
  const summary = await runWithAws();
  return applyOnlyFilter(summary, options.only);
};

const runWithFixtures = async (fixturesPath: string): Promise<DoctorSummary> => {
  const fixtures = readFixtures(fixturesPath);
  const config = loadConfigForFixtures(fixtures);
  const provider = new FixtureChecksProvider(config, fixtures);
  const runner = new DoctorRunner(provider);
  return runner.runChecks();
};

const runWithAws = async (): Promise<DoctorSummary> => {
  const config = loadConfigSync();
  const provider = new AwsChecksProvider(config);
  const runner = new DoctorRunner(provider);
  return runner.runChecks();
};

const loadConfigForFixtures = (fixtures: DoctorFixture): Config => {
  try {
    return loadConfigSync();
  } catch {
    if (!fixtures.managementAccountId || !fixtures.awsAcceleratorVersion || !fixtures.enabledRegions) {
      throw new Error('config.ts missing. Provide managementAccountId, awsAcceleratorVersion, and enabledRegions in fixtures.');
    }
    return {
      ...baseConfig,
      awsAcceleratorVersion: fixtures.awsAcceleratorVersion,
      environments: {},
      templates: [],
      managementAccountId: fixtures.managementAccountId,
      homeRegion: fixtures.homeRegion,
      enabledRegions: fixtures.enabledRegions,
    };
  }
};

const readFixtures = (fixturesPath: string): DoctorFixture => {
  const absolutePath = path.isAbsolute(fixturesPath)
    ? fixturesPath
    : path.join(process.cwd(), fixturesPath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<DoctorFixture>;
  const requiredKeys: (keyof DoctorFixture)[] = [
    'accountId',
    'homeRegion',
    'installerVersion',
    'installerStackExists',
    'configBucketExists',
    'cdkAssetsBuckets',
  ];
  for (const key of requiredKeys) {
    if (parsed[key] === undefined || parsed[key] === null) {
      throw new Error(`Fixtures missing required field: ${key}`);
    }
  }
  return parsed as DoctorFixture;
};

const applyOnlyFilter = (summary: DoctorSummary, only?: string[]): DoctorSummary => {
  if (!only || only.length === 0) {
    return summary;
  }
  const allowed = new Set(only.map((value) => value.trim()).filter(Boolean));
  const results = summary.results.filter((result) => allowed.has(result.id));
  return {
    results,
    hasFailures: results.some((result) => result.status === CheckStatus.FAIL),
  };
};
