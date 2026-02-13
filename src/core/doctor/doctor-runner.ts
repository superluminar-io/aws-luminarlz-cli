import { ChecksProvider } from './checks-provider';
import { CheckResult, CheckStatus, DoctorSummary } from './doctor';

export class DoctorRunner {
  constructor(private readonly provider: ChecksProvider) {}

  async runChecks(): Promise<DoctorSummary> {
    const results: CheckResult[] = await this.provider.getChecks();
    return {
      results,
      hasFailures: results.some((result) => result.status === CheckStatus.FAIL),
    };
  }
}
