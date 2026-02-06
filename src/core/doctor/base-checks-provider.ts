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
}
