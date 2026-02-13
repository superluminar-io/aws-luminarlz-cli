import { Command, Option } from 'clipanion';
import { requestLambdaConcurrencyIncreases } from '../core/quotas/lambda-concurrency';

export class QuotasLambdaConcurrencyRequest extends Command {
  static paths = [['quotas', 'lambda-concurrency', 'request']];

  static usage = Command.Usage({
    category: 'Quotas',
    description: 'Request Lambda concurrency quota increases for enrolled accounts.',
  });

  dryRun = Option.Boolean('--dry-run', {
    description: 'Show planned requests without submitting them.',
  });

  async execute() {
    const summary = await requestLambdaConcurrencyIncreases({
      dryRun: this.dryRun ?? false,
    });
    summary.lines.forEach((line) => console.log(line));
    if (summary.failures > 0) {
      return 1;
    }
    return 0;
  }
}
