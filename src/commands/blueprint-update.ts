import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { Command, Option } from 'clipanion';
import { blueprintExists, updateBlueprint } from '../core/blueprint/blueprint';
import { createInteractiveDiffSelector, UserAbortError } from '../core/blueprint/update-interactive';

const AWS_LUMINARLZ_BLUEPRINTS_GITHUB_URL = 'https://github.com/superluminar-io/aws-luminarlz-cli/tree/main/blueprints';
const DEFAULT_BLUEPRINT = 'foundational';

interface BlueprintUpdateInputs {
  accountsRootEmail: string;
  region: string;
}

interface ProjectConfigDefaults {
  accountsRootEmail?: string;
  region?: string;
}

const readProjectConfigDefaults = (): ProjectConfigDefaults => {
  const configPath = path.join(process.cwd(), 'config.ts');
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const content = fs.readFileSync(configPath, 'utf8');
  return {
    accountsRootEmail: content.match(/export const AWS_ACCOUNTS_ROOT_EMAIL\s*=\s*['"]([^'"]+)['"]/)?.[1],
    region: content.match(/export const HOME_REGION\s*=\s*['"]([^'"]+)['"]/)?.[1],
  };
};

const promptRequiredValue = async (
  rl: readline.Interface,
  prompt: string,
  validate: (value: string) => boolean,
  errorMessage: (value: string) => string,
): Promise<string> => {
  const value = await rl.question(prompt);
  if (!validate(value)) {
    throw new Error(errorMessage(value));
  }
  return value;
};

const resolveBlueprintUpdateInputs = async (
  rl: readline.Interface,
  options: {
    accountsRootEmail?: string;
    region?: string;
  },
): Promise<BlueprintUpdateInputs> => {
  if (!blueprintExists(DEFAULT_BLUEPRINT)) {
    throw new Error(`Blueprint ${DEFAULT_BLUEPRINT} does not exist. Please check the available blueprints at ${AWS_LUMINARLZ_BLUEPRINTS_GITHUB_URL}`);
  }

  const defaults = readProjectConfigDefaults();
  const accountsRootEmail = options.accountsRootEmail ?? defaults.accountsRootEmail ?? await promptRequiredValue(
    rl,
    'Please provide the email address used for the AWS accounts root emails: ',
    (value) => value.length >= 4 && value.includes('@'),
    (value) => `Invalid email address: ${value}`,
  );

  const region = options.region ?? defaults.region ?? await promptRequiredValue(
    rl,
    'Please provide the region the Landing Zone Accelerator on AWS has been installed in (the home region): ',
    (value) => value.length > 0,
    (value) => `Invalid region: ${value}`,
  );

  return {
    accountsRootEmail,
    region,
  };
};

const printUpdateSummary = (summary: {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  unchangedCount: number;
}, dryRun: boolean, stdout: { write: (text: string) => void }): void => {
  stdout.write(`Created files: ${summary.createdCount}\n`);
  stdout.write(`Updated files: ${summary.updatedCount}\n`);
  stdout.write(`Skipped files: ${summary.skippedCount}\n`);
  stdout.write(`Unchanged files: ${summary.unchangedCount}\n`);
  if (dryRun) {
    stdout.write('Dry run completed. No files were modified.\n');
  }
  stdout.write('Done. ✅\n');
};

export class BlueprintUpdate extends Command {
  static paths = [['blueprint', 'update']];

  static usage = Command.Usage({
    description: 'Update project files from a blueprint with per-file diff confirmation.',
    details: 'A list of blueprints can be found in the luminarlz repository: ' + AWS_LUMINARLZ_BLUEPRINTS_GITHUB_URL,
    examples: [
      ['Preview updates from foundational blueprint', '$0 blueprint update --dry-run'],
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
      const inputs = await resolveBlueprintUpdateInputs(rl, {
        accountsRootEmail: this.accountsRootEmail,
        region: this.region,
      });

      const onExistingFileDiff = createInteractiveDiffSelector({
        rl,
        autoApply: Boolean(this.yes),
        dryRun: Boolean(this.dryRun),
        lineMode: Boolean(this.lineMode),
        stdout: this.context.stdout,
      });

      const summary = await updateBlueprint(DEFAULT_BLUEPRINT, {
        accountsRootEmail: inputs.accountsRootEmail,
        region: inputs.region,
        dryRun: this.dryRun,
        onExistingFileDiff,
      });

      printUpdateSummary(summary, Boolean(this.dryRun), this.context.stdout);
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
