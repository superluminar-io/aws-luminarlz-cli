import * as readline from 'node:readline/promises';
import { Command, Option } from 'clipanion';
import { runSetupUpdate, UserAbortError, writeSetupUpdateSummary } from '../core/interactive-merge';

const AWS_LUMINARLZ_BLUEPRINTS_GITHUB_URL = 'https://github.com/superluminar-io/aws-luminarlz-cli/tree/main/blueprints';

export class SetupUpdate extends Command {
  static paths = [['setup', 'update']];

  static usage = Command.Usage({
    description: 'Update setup files with per-file diff confirmation.',
    details: 'A list of blueprints can be found in the luminarlz repository: ' + AWS_LUMINARLZ_BLUEPRINTS_GITHUB_URL,
    examples: [
      ['Preview setup file updates', '$0 setup update --dry-run'],
    ],
  });

  accountsRootEmail = Option.String('--accounts-root-email', {
    description: 'The email address used for the AWS accounts root emails.',
  });

  region = Option.String('--region', {
    description: 'The region the Landing Zone Accelerator on AWS has been installed in (the home region).',
  });

  yes = Option.Boolean('--yes', {
    description: 'Apply all existing-file diffs without prompting.',
  });

  dryRun = Option.Boolean('--dry-run', {
    description: 'Preview changes without writing files.',
  });

  lineMode = Option.Boolean('--line-mode', {
    description: 'Review and apply changes line-by-line instead of hunk-by-hunk.',
  });

  async execute() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const summary = await runSetupUpdate(rl, this.context.stdout, {
        accountsRootEmail: this.accountsRootEmail,
        region: this.region,
        autoApply: Boolean(this.yes),
        dryRun: Boolean(this.dryRun),
        lineMode: Boolean(this.lineMode),
      });

      writeSetupUpdateSummary(summary, Boolean(this.dryRun), this.context.stdout);
    } catch (error) {
      if (error instanceof UserAbortError) {
        this.context.stdout.write('Aborted.\n');
        return;
      }
      throw error;
    } finally {
      rl.close();
    }
  }
}
