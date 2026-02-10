import { BaseChecksProvider } from './base-checks-provider';
import { ChecksProvider } from './checks-provider';
import { CheckResult, CheckStatus, DoctorFixture } from './doctor';
import {
  awsAcceleratorInstallerRepositoryBranchName,
  Config,
} from '../../config';

export class FixtureChecksProvider extends BaseChecksProvider implements ChecksProvider {
  constructor(config: Config, private readonly fixtures: DoctorFixture) {
    super(config);
  }

  async getChecks(): Promise<CheckResult[]> {
    const results: CheckResult[] = [
      this.checkAwsIdentityFromFixture(),
      this.checkInstallerVersionFromFixture(),
      this.checkInstallerStackFromFixture(),
      this.checkConfigBucketFromFixture(),
      this.checkCdkAssetsBucketsFromFixture(),
    ];

    const lambdaCheck = this.checkLambdaConcurrencyFromFixture();
    if (lambdaCheck) {
      results.push(lambdaCheck);
    }

    const checkoutCheck = this.checkLzaCheckoutFromFixture();
    if (checkoutCheck) {
      results.push(checkoutCheck);
    }

    return results;
  }

  private checkAwsIdentityFromFixture(): CheckResult {
    return this.buildAwsIdentityCheck(this.fixtures.accountId, this.config.managementAccountId);
  }

  private checkInstallerVersionFromFixture(): CheckResult {
    return this.buildInstallerVersionCheck(this.fixtures.installerVersion, this.config.awsAcceleratorVersion);
  }

  private checkInstallerStackFromFixture(): CheckResult {
    return this.buildInstallerStackCheck(this.fixtures.installerStackExists);
  }

  private checkConfigBucketFromFixture(): CheckResult {
    return this.buildConfigBucketCheck(this.fixtures.configBucketExists);
  }

  private checkCdkAssetsBucketsFromFixture(): CheckResult {
    const missingRegions = this.config.enabledRegions.filter((region) => !this.fixtures.cdkAssetsBuckets[region]);
    return this.buildCdkAssetsBucketsCheck(missingRegions);
  }

  private checkLzaCheckoutFromFixture(): CheckResult | null {
    if (this.fixtures.lzaCheckoutExists === undefined && this.fixtures.lzaCheckoutBranch === undefined) {
      return null;
    }

    const expectedBranch = awsAcceleratorInstallerRepositoryBranchName(this.config);
    const checkoutExists = this.fixtures.lzaCheckoutExists === true;
    const branchMismatch = this.fixtures.lzaCheckoutBranch
      ? this.fixtures.lzaCheckoutBranch !== expectedBranch
      : false;

    if (!checkoutExists) {
      return this.buildLzaCheckoutCheck(
        CheckStatus.FAIL,
        'Checkout missing',
        'Run a command that requires the LZA Core CLI to trigger checkout.',
      );
    }

    if (branchMismatch) {
      return this.buildLzaCheckoutCheck(
        CheckStatus.FAIL,
        `Current: ${this.fixtures.lzaCheckoutBranch}, expected: ${expectedBranch}`,
        'Delete the existing checkout folder and rerun a command that uses the LZA Core CLI.',
      );
    }

    return this.buildLzaCheckoutCheck(
      CheckStatus.OK,
      'Checkout present and branch matches',
    );
  }

  private checkLambdaConcurrencyFromFixture(): CheckResult | null {
    if (!this.fixtures.lambdaConcurrencyByRegion && !this.fixtures.lambdaConcurrencyByAccountRegion) {
      return null;
    }

    const minConcurrency = this.getMinLambdaConcurrency();
    const regions = this.getLambdaRegionsToCheck();
    const insufficient: { accountId: string; region: string; current: number }[] = [];
    const missing: { accountId: string; region: string }[] = [];

    if (this.fixtures.lambdaConcurrencyByAccountRegion) {
      for (const [accountId, accountRegions] of Object.entries(this.fixtures.lambdaConcurrencyByAccountRegion)) {
        regions.forEach((region) => {
          const current = accountRegions?.[region];
          if (current === undefined || current === null) {
            missing.push({ accountId, region });
            return;
          }
          if (current < minConcurrency) {
            insufficient.push({ accountId, region, current });
          }
        });
      }
    } else if (this.fixtures.lambdaConcurrencyByRegion) {
      const accountId = this.fixtures.accountId;
      regions.forEach((region) => {
        const current = this.fixtures.lambdaConcurrencyByRegion?.[region];
        if (current === undefined || current === null) {
          missing.push({ accountId, region });
          return;
        }
        if (current < minConcurrency) {
          insufficient.push({ accountId, region, current });
        }
      });
    }

    return this.buildLambdaConcurrencyCheck(minConcurrency, regions, insufficient, missing, [], []);
  }

  private getLambdaRegionsToCheck(): string[] {
    return Array.from(new Set(this.config.enabledRegions));
  }

  private getMinLambdaConcurrency(): number {
    const fromConfig = this.config.minLambdaConcurrency;
    if (Number.isFinite(fromConfig) && fromConfig > 0) {
      return Math.floor(fromConfig);
    }
    const raw = process.env.LZA_MIN_LAMBDA_CONCURRENCY;
    if (!raw) {
      return 1000;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1000;
    }
    return Math.floor(parsed);
  }
}
