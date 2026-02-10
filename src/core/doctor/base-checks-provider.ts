import { CheckResult, CheckStatus } from './doctor';
import { Config } from '../../config';

export abstract class BaseChecksProvider {
  protected constructor(protected readonly config: Config) {}

  protected buildAwsIdentityCheck(currentAccountId: string, expectedAccountId: string): CheckResult {
    const accountMismatch = currentAccountId !== expectedAccountId;
    return {
      id: 'aws-identity',
      label: 'AWS Account (Management)',
      status: accountMismatch ? CheckStatus.FAIL : CheckStatus.OK,
      details: `Current: ${currentAccountId}, expected: ${expectedAccountId}`,
      fix: accountMismatch
        ? 'Assume management account credentials (SSO/role) and rerun. Example: aws sso login --profile <management>.'
        : undefined,
    };
  }

  protected buildInstallerVersionCheck(installerVersion: string, expectedVersion: string): CheckResult {
    const mismatch = installerVersion !== expectedVersion;
    return {
      id: 'installer-version',
      label: 'LZA Installer Version (SSM)',
      status: mismatch ? CheckStatus.FAIL : CheckStatus.OK,
      details: `SSM: ${installerVersion}, config: ${expectedVersion}`,
      fix: mismatch
        ? 'Update awsAcceleratorVersion in config.ts or run npm run cli -- lza installer-version update.'
        : undefined,
    };
  }

  protected buildInstallerStackCheck(exists: boolean): CheckResult {
    return {
      id: 'installer-stack',
      label: 'Installer Stack',
      status: exists ? CheckStatus.OK : CheckStatus.FAIL,
      details: exists ? 'Stack exists' : 'Stack missing',
      fix: exists ? undefined : 'Install LZA (Installer Stack) in the management account first.',
    };
  }

  protected buildConfigBucketCheck(exists: boolean, bucketName?: string): CheckResult {
    return {
      id: 'config-bucket',
      label: 'Config Bucket',
      status: exists ? CheckStatus.OK : CheckStatus.FAIL,
      details: bucketName ?? (exists ? 'Bucket exists' : 'Bucket missing'),
      fix: exists ? undefined : 'Verify LZA installation and the config bucket name; re-deploy installer if missing.',
    };
  }

  protected buildCdkAssetsBucketsCheck(missingRegions: string[], bucketErrors: string[] = []): CheckResult {
    let details = missingRegions.length === 0
      ? 'All regions present'
      : `Missing: ${missingRegions.join(', ')}`;
    if (bucketErrors.length > 0) {
      details += `\nErrors: ${bucketErrors.join('; ')}`;
    }

    return {
      id: 'cdk-assets-buckets',
      label: 'CDK Assets Buckets',
      status: missingRegions.length === 0 ? CheckStatus.OK : CheckStatus.FAIL,
      details,
      fix: missingRegions.length === 0
        ? undefined
        : 'Run npm run cli -- lza core bootstrap for the missing regions.',
    };
  }

  protected buildLzaCheckoutCheck(status: CheckStatus, details: string, fix?: string): CheckResult {
    return {
      id: 'lza-checkout',
      label: 'LZA Checkout',
      status,
      details,
      fix,
    };
  }

  protected buildLambdaConcurrencyCheck(
    minConcurrency: number,
    regions: string[],
    insufficient: { accountId: string; region: string; current: number }[],
    missing: { accountId: string; region: string }[],
    errors: string[],
    skippedAccounts: string[],
  ): CheckResult {
    const hasIssues = insufficient.length > 0 || missing.length > 0 || errors.length > 0;
    const details = this.buildLambdaConcurrencyDetails({
      hasIssues,
      insufficient,
      missing,
      errors,
      skippedAccounts,
      minConcurrency,
      regions,
    });

    return {
      id: 'lambda-concurrency',
      label: 'Lambda Concurrency',
      status: hasIssues ? CheckStatus.FAIL : CheckStatus.OK,
      details: details.join('\n'),
      fix: hasIssues
        ? `Increase AWS Lambda concurrent executions quota to at least ${minConcurrency} in the listed regions.`
        : undefined,
    };
  }

  private buildLambdaConcurrencyDetails({
    hasIssues,
    insufficient,
    missing,
    errors,
    skippedAccounts,
    minConcurrency,
    regions,
  }: {
    hasIssues: boolean;
    insufficient: { accountId: string; region: string; current: number }[];
    missing: { accountId: string; region: string }[];
    errors: string[];
    skippedAccounts: string[];
    minConcurrency: number;
    regions: string[];
  }): string[] {
    const details: string[] = [];

    if (hasIssues) {
      details.push(...this.renderLambdaConcurrencyInsufficient(insufficient));
      details.push(...this.renderLambdaConcurrencyMissing(missing));
      if (errors.length > 0) {
        details.push('Errors:', ...errors.map((item) => `- ${item}`));
      }
    } else {
      details.push(`Minimum: ${minConcurrency}`, `Regions: ${regions.join(', ')}`);
    }

    if (skippedAccounts.length > 0) {
      details.push('Skipped accounts (role missing):', ...skippedAccounts.map((accountId) => `- ${accountId}`));
    }

    return details;
  }

  private renderLambdaConcurrencyInsufficient(
    insufficient: { accountId: string; region: string; current: number }[],
  ): string[] {
    if (insufficient.length === 0) {
      return [];
    }
    const grouped = new Map<string, { region: string; current: number }[]>();
    insufficient.forEach((item) => {
      const list = grouped.get(item.accountId) ?? [];
      list.push({ region: item.region, current: item.current });
      grouped.set(item.accountId, list);
    });
    const lines = ['Insufficient:'];
    Array.from(grouped.keys()).sort().forEach((accountId) => {
      const entries = (grouped.get(accountId) ?? []).sort((a, b) => a.region.localeCompare(b.region));
      const summary = entries.map((entry) => `${entry.region}=${entry.current}`).join(', ');
      lines.push(`- ${accountId}: ${summary}`);
    });
    return lines;
  }

  private renderLambdaConcurrencyMissing(
    missing: { accountId: string; region: string }[],
  ): string[] {
    if (missing.length === 0) {
      return [];
    }
    const grouped = new Map<string, string[]>();
    missing.forEach((item) => {
      const list = grouped.get(item.accountId) ?? [];
      list.push(item.region);
      grouped.set(item.accountId, list);
    });
    const lines = ['Missing:'];
    Array.from(grouped.keys()).sort().forEach((accountId) => {
      const regionsList = (grouped.get(accountId) ?? []).sort();
      lines.push(`- ${accountId}: ${regionsList.join(', ')}`);
    });
    return lines;
  }
}
