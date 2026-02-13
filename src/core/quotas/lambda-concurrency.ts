import { GetAccountSettingsCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  ListServiceQuotasCommand,
  ListRequestedServiceQuotaChangeHistoryCommand,
  RequestServiceQuotaIncreaseCommand,
  ServiceQuotasClient,
} from '@aws-sdk/client-service-quotas';
import { loadConfigSync } from '../../config';
import {
  assumeRoleForAccount,
  getLambdaRegionsToCheck,
  getMinLambdaConcurrency,
  listOrganizationAccountIds,
} from '../doctor/lambda-concurrency';

const LAMBDA_SERVICE_CODE = 'lambda';
const LAMBDA_CONCURRENCY_QUOTA_NAME = 'Concurrent executions';

export interface LambdaConcurrencyRequestSummary {
  lines: string[];
  failures: number;
}

export const requestLambdaConcurrencyIncreases = async ({
  dryRun,
}: {
  dryRun: boolean;
}): Promise<LambdaConcurrencyRequestSummary> => {
  const config = loadConfigSync();
  const minConcurrency = getMinLambdaConcurrency(config);
  const regions = getLambdaRegionsToCheck(config);
  const accountIds = await listOrganizationAccountIds(config);

  const lines: string[] = [];
  let failures = 0;

  lines.push(`Lambda concurrency quota requests (min: ${minConcurrency})`);
  lines.push(`Regions: ${regions.join(', ')}`);
  lines.push(`Dry run: ${dryRun ? 'yes' : 'no'}`);

  const quotaCodeByRegion = new Map<string, string>();

  for (const accountId of accountIds) {
    const credentials = await assumeRoleForAccount(config, accountId);
    if (credentials === null) {
      lines.push(`Skip ${accountId}: role ${process.env.LZA_ASSUME_ROLE_NAME || 'AWSControlTowerExecution'} not available`);
      continue;
    }

    for (const region of regions) {
      const lambda = new LambdaClient({ region, credentials: credentials ?? undefined });
      const result = await lambda.send(new GetAccountSettingsCommand({}));
      const current = result.AccountLimit?.ConcurrentExecutions;
      if (current === undefined || current === null) {
        lines.push(`Skip ${accountId} ${region}: unable to read current concurrency`);
        continue;
      }
      if (current >= minConcurrency) {
        lines.push(`OK ${accountId} ${region}: ${current}`);
        continue;
      }

      let quotaCode = quotaCodeByRegion.get(region);
      if (!quotaCode) {
        quotaCode = await resolveLambdaConcurrencyQuotaCode(region);
        quotaCodeByRegion.set(region, quotaCode);
      }

      const serviceQuotas = new ServiceQuotasClient({ region, credentials: credentials ?? undefined });
      const hasOpenRequest = await hasOpenQuotaRequest(serviceQuotas, quotaCode);
      if (hasOpenRequest) {
        lines.push(`Skip ${accountId} ${region}: quota request already pending`);
        continue;
      }

      if (dryRun) {
        lines.push(`Request ${accountId} ${region}: ${current} -> ${minConcurrency}`);
        continue;
      }

      try {
        await serviceQuotas.send(new RequestServiceQuotaIncreaseCommand({
          ServiceCode: LAMBDA_SERVICE_CODE,
          QuotaCode: quotaCode,
          DesiredValue: minConcurrency,
        }));
        lines.push(`Requested ${accountId} ${region}: ${current} -> ${minConcurrency}`);
      } catch (error) {
        failures += 1;
        const message = (error as Error)?.message ?? 'Unknown error';
        lines.push(`Failed ${accountId} ${region}: ${message}`);
      }
    }
  }

  return { lines, failures };
};

const resolveLambdaConcurrencyQuotaCode = async (region: string): Promise<string> => {
  const serviceQuotas = new ServiceQuotasClient({ region });
  let nextToken: string | undefined;
  do {
    const result = await serviceQuotas.send(new ListServiceQuotasCommand({
      ServiceCode: LAMBDA_SERVICE_CODE,
      NextToken: nextToken,
    }));
    const match = (result.Quotas ?? []).find((quota) => quota.QuotaName === LAMBDA_CONCURRENCY_QUOTA_NAME);
    if (match?.QuotaCode) {
      return match.QuotaCode;
    }
    nextToken = result.NextToken;
  } while (nextToken);

  throw new Error(`Unable to resolve quota code for ${LAMBDA_SERVICE_CODE} (${LAMBDA_CONCURRENCY_QUOTA_NAME})`);
};

const hasOpenQuotaRequest = async (
  client: ServiceQuotasClient,
  quotaCode: string,
): Promise<boolean> => {
  let nextToken: string | undefined;
  const openStatuses = new Set(['PENDING', 'CASE_OPENED']);
  do {
    const result = await client.send(new ListRequestedServiceQuotaChangeHistoryCommand({
      ServiceCode: LAMBDA_SERVICE_CODE,
      NextToken: nextToken,
    }));
    const open = (result.RequestedQuotas ?? []).some((request) =>
      request.QuotaCode === quotaCode && request.Status && openStatuses.has(request.Status),
    );
    if (open) {
      return true;
    }
    nextToken = result.NextToken;
  } while (nextToken);
  return false;
};
