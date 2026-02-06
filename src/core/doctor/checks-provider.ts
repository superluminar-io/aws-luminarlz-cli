import { CheckResult } from './doctor';

export interface ChecksProvider {
  getChecks(): Promise<CheckResult[]>;
}
