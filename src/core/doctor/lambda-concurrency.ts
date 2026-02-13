import { ListAccountsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { Config } from '../../config';

export const getLambdaRegionsToCheck = (config: Config): string[] =>
  Array.from(new Set(config.enabledRegions));

export const getMinLambdaConcurrency = (config: Config): number => {
  const fromConfig = config.minLambdaConcurrency;
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
};

export const getLambdaCheckRoleName = (): string =>
  process.env.LZA_ASSUME_ROLE_NAME || 'AWSControlTowerExecution';

export const listOrganizationAccountIds = async (config: Config): Promise<string[]> => {
  const client = new OrganizationsClient({ region: config.homeRegion });
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
    return [config.managementAccountId];
  }

  if (accounts.length === 0) {
    return [config.managementAccountId];
  }

  return accounts;
};

type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export const assumeRoleForAccount = async (
  config: Config,
  accountId: string,
): Promise<AwsCredentials | null | undefined> => {
  if (accountId === config.managementAccountId) {
    return undefined;
  }

  const roleName = getLambdaCheckRoleName();
  const roleArn = `arn:aws:iam::${accountId}:role/${roleName}`;
  const sts = new STSClient({ region: config.homeRegion });
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
};
