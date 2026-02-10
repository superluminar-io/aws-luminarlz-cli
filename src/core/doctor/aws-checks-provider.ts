import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { GetAccountSettingsCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { ListAccountsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { BaseChecksProvider } from './base-checks-provider';
import { ChecksProvider } from './checks-provider';
import { CheckResult, CheckStatus } from './doctor';
import {
  awsAcceleratorConfigBucketName,
  awsAcceleratorInstallerRepositoryBranchName,
  cdkAccelAssetsBucketNamePrefix,
  Config,
} from '../../config';
import { getVersion } from '../accelerator/installer/installer';
import { getCheckoutPath } from '../accelerator/repository/checkout';

export class AwsChecksProvider extends BaseChecksProvider implements ChecksProvider {
  constructor(config: Config) {
    super(config);
  }

  async getChecks(): Promise<CheckResult[]> {
    return [
      await this.checkAwsIdentity(),
      await this.checkInstallerVersion(),
      await this.checkInstallerStack(),
      await this.checkConfigBucket(),
      await this.checkCdkAssetsBuckets(),
      await this.checkLambdaConcurrency(),
      this.checkLzaCheckout(),
    ];
  }

  private async checkAwsIdentity(): Promise<CheckResult> {
    const client = new STSClient({ region: this.config.homeRegion });
    const result = await client.send(new GetCallerIdentityCommand({}));
    if (!result.Account) {
      throw new Error('Unable to determine AWS account ID');
    }
    return this.buildAwsIdentityCheck(result.Account, this.config.managementAccountId);
  }

  private async checkInstallerVersion(): Promise<CheckResult> {
    const installerVersion = await getVersion(this.config.homeRegion);
    return this.buildInstallerVersionCheck(installerVersion, this.config.awsAcceleratorVersion);
  }

  private async checkInstallerStack(): Promise<CheckResult> {
    const client = new CloudFormationClient({ region: this.config.homeRegion });
    let exists = false;
    try {
      const result = await client.send(new DescribeStacksCommand({
        StackName: this.config.awsAcceleratorInstallerStackName,
      }));
      exists = (result.Stacks?.length ?? 0) > 0;
    } catch (error) {
      const message = (error as Error).message || '';
      if (message.includes('does not exist')) {
        exists = false;
      } else {
        throw error;
      }
    }

    return this.buildInstallerStackCheck(exists);
  }

  private async checkConfigBucket(): Promise<CheckResult> {
    const bucketName = awsAcceleratorConfigBucketName(this.config);
    const exists = await this.headBucket(bucketName, this.config.homeRegion);
    return this.buildConfigBucketCheck(exists, bucketName);
  }

  private async checkCdkAssetsBuckets(): Promise<CheckResult> {
    const prefix = cdkAccelAssetsBucketNamePrefix(this.config);
    const bucketChecks = await Promise.allSettled(
      this.config.enabledRegions.map(async (region) => {
        const bucketName = `${prefix}${region}`;
        const exists = await this.headBucket(bucketName, region);
        return { region, exists };
      }),
    );

    const missingRegions: string[] = [];
    const bucketErrors: string[] = [];
    for (const [index, result] of bucketChecks.entries()) {
      const region = this.config.enabledRegions[index];
      if (result.status === 'fulfilled') {
        if (!result.value.exists) {
          missingRegions.push(region);
        }
      } else {
        missingRegions.push(region);
        const reason = (result.reason as Error)?.message ?? 'Unknown error';
        bucketErrors.push(`${region}: ${reason}`);
      }
    }

    return this.buildCdkAssetsBucketsCheck(missingRegions, bucketErrors);
  }

  private checkLzaCheckout(): CheckResult {
    const checkoutPath = getCheckoutPath();
    const expectedBranch = awsAcceleratorInstallerRepositoryBranchName(this.config);

    if (!fs.existsSync(checkoutPath)) {
      return this.buildLzaCheckoutCheck(
        CheckStatus.FAIL,
        'Checkout missing',
        'Run a command that requires the LZA Core CLI to trigger checkout.',
      );
    }

    const headPath = path.join(checkoutPath, '.git', 'HEAD');
    let currentBranch: string | undefined;
    if (fs.existsSync(headPath)) {
      const headContent = fs.readFileSync(headPath, 'utf8').trim();
      const match = headContent.match(/^ref: refs\/heads\/(.+)$/);
      if (match?.[1]) {
        currentBranch = match[1];
      }
    }

    if (currentBranch && currentBranch !== expectedBranch) {
      return this.buildLzaCheckoutCheck(
        CheckStatus.FAIL,
        `Current: ${currentBranch}, expected: ${expectedBranch}`,
        'Delete the existing checkout folder and rerun a command that uses the LZA Core CLI.',
      );
    }

    return this.buildLzaCheckoutCheck(
      CheckStatus.OK,
      currentBranch ? `Branch: ${currentBranch}` : 'Checkout present',
    );
  }

  private async checkLambdaConcurrency(): Promise<CheckResult> {
    const minConcurrency = this.getMinLambdaConcurrency();
    const regions = this.getLambdaRegionsToCheck();
    const insufficient: { accountId: string; region: string; current: number }[] = [];
    const missing: { accountId: string; region: string }[] = [];
    const errors: string[] = [];
    const skippedAccounts: string[] = [];

    const accountIds = await this.getOrganizationAccountIds();

    const checks = await Promise.allSettled(accountIds.map(async (accountId) => {
      const credentials = await this.getAssumedCredentialsIfNeeded(accountId);
      if (credentials === null) {
        skippedAccounts.push(accountId);
        return;
      }
      await Promise.all(regions.map(async (region) => {
        const client = new LambdaClient({ region, credentials: credentials ?? undefined });
        const result = await client.send(new GetAccountSettingsCommand({}));
        const current = result.AccountLimit?.ConcurrentExecutions;
        if (current === undefined || current === null) {
          missing.push({ accountId, region });
          return;
        }
        if (current < minConcurrency) {
          insufficient.push({ accountId, region, current });
        }
      }));
    }));

    checks.forEach((result, index) => {
      if (result.status === 'rejected') {
        const reason = (result.reason as Error)?.message ?? 'Unknown error';
        errors.push(`${accountIds[index]}: ${reason}`);
      }
    });

    return this.buildLambdaConcurrencyCheck(minConcurrency, regions, insufficient, missing, errors, skippedAccounts);
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

  private async getOrganizationAccountIds(): Promise<string[]> {
    const client = new OrganizationsClient({ region: this.config.homeRegion });
    const accounts: string[] = [];
    let nextToken: string | undefined;
    try {
      do {
        const result = await client.send(new ListAccountsCommand({ NextToken: nextToken }));
        (result.Accounts ?? []).forEach((account) => {
          if (account.Id && account.Status === 'ACTIVE') {
            accounts.push(account.Id);
          }
        });
        nextToken = result.NextToken;
      } while (nextToken);
    } catch {
      return [this.config.managementAccountId];
    }

    if (accounts.length === 0) {
      return [this.config.managementAccountId];
    }

    return accounts;
  }

  private async getAssumedCredentialsIfNeeded(accountId: string) {
    if (accountId === this.config.managementAccountId) {
      return undefined;
    }

    const roleName = this.getLambdaCheckRoleName();
    const roleArn = `arn:aws:iam::${accountId}:role/${roleName}`;
    const sts = new STSClient({ region: this.config.homeRegion });
    try {
      const result = await sts.send(new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: `aws-luminarlz-cli-doctor-${Date.now()}`,
      }));
      if (!result.Credentials) {
        return null;
      }
      return {
        accessKeyId: result.Credentials.AccessKeyId ?? '',
        secretAccessKey: result.Credentials.SecretAccessKey ?? '',
        sessionToken: result.Credentials.SessionToken,
      };
    } catch {
      return null;
    }
  }

  private getLambdaCheckRoleName(): string {
    return process.env.LZA_ASSUME_ROLE_NAME || 'AWSControlTowerExecution';
  }

  private async headBucket(bucketName: string, region: string): Promise<boolean> {
    const client = new S3Client({ region });
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucketName }));
      return true;
    } catch (error) {
      const message = (error as Error).message || '';
      if (message.includes('NotFound') || message.includes('404')) {
        return false;
      }
      if (message.includes('Forbidden') || message.includes('403')) {
        throw new Error(`No access to bucket ${bucketName}`);
      }
      return false;
    }
  }
}
