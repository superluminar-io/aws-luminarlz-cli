import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { Command, Option } from 'clipanion';
import { synchronizeBlueprintFiles, blueprintExists } from '../core/blueprint/blueprint';
import { OutputWriter } from '../core/blueprint/blueprint-report';
import { createInteractiveDiffSelector, UserAbortError } from '../core/interactive-merge';

const AWS_LUMINARLZ_BLUEPRINTS_GITHUB_URL = 'https://github.com/superluminar-io/aws-luminarlz-cli/tree/main/blueprints';
const DEFAULT_BLUEPRINT = 'foundational';

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
  readlineInterface: readline.Interface,
  prompt: string,
  validate: (value: string) => boolean,
  errorMessage: (value: string) => string,
): Promise<string> => {
  const value = await readlineInterface.question(prompt);
  if (!validate(value)) {
    throw new Error(errorMessage(value));
  }
  return value;
};

const assertDefaultBlueprintExists = (): void => {
  if (!blueprintExists(DEFAULT_BLUEPRINT)) {
    throw new Error(`Blueprint ${DEFAULT_BLUEPRINT} does not exist. Please check the available blueprints at ${AWS_LUMINARLZ_BLUEPRINTS_GITHUB_URL}`);
  }
};

const resolveProvidedOrDefault = (provided?: string, fallback?: string): string | undefined => {
  return provided ?? fallback;
};

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
    const readlineInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      assertDefaultBlueprintExists();

      const defaults = readProjectConfigDefaults();
      const accountsRootEmail = resolveProvidedOrDefault(this.accountsRootEmail, defaults.accountsRootEmail)
        ?? await promptRequiredValue(
          readlineInterface,
          'Please provide the email address used for the AWS accounts root emails: ',
          (value) => value.length >= 4 && value.includes('@'),
          (value) => `Invalid email address: ${value}`,
        );
      const region = resolveProvidedOrDefault(this.region, defaults.region)
        ?? await promptRequiredValue(
          readlineInterface,
          'Please provide the region the Landing Zone Accelerator on AWS has been installed in (the home region): ',
          (value) => value.length > 0,
          (value) => `Invalid region: ${value}`,
        );

      const onExistingFileDiff = createInteractiveDiffSelector({
        readlineInterface: readlineInterface,
        autoApply: Boolean(this.yes),
        dryRun: Boolean(this.dryRun),
        lineMode: Boolean(this.lineMode),
        stdout: this.context.stdout as OutputWriter,
      });

      const summary = await synchronizeBlueprintFiles({
        accountsRootEmail,
        region,
        dryRun: Boolean(this.dryRun),
        onExistingFileDiff,
      });
      summary.writeOutput(this.context.stdout as OutputWriter);
    } catch (error) {
      if (error instanceof UserAbortError) {
        this.context.stdout.write('Aborted.\n');
        return;
      }
      throw error;
    } finally {
      readlineInterface.close();
    }
  }
}
