import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { createInteractiveDiffSelector } from './update-interactive';
import { blueprintExists, updateBlueprint, UpdateBlueprintResult } from '../blueprint/blueprint';

const AWS_LUMINARLZ_BLUEPRINTS_GITHUB_URL = 'https://github.com/superluminar-io/aws-luminarlz-cli/tree/main/blueprints';
const DEFAULT_BLUEPRINT = 'foundational';

interface ProjectConfigDefaults {
  accountsRootEmail?: string;
  region?: string;
}

interface SetupUpdateInputs {
  accountsRootEmail: string;
  region: string;
}

export interface SetupUpdateOptions {
  accountsRootEmail?: string;
  region?: string;
  autoApply: boolean;
  dryRun: boolean;
  lineMode: boolean;
}

export type SetupUpdateOutput = { write: (text: string) => void };

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

const resolveSetupUpdateInputs = async (
  rl: readline.Interface,
  options: Pick<SetupUpdateOptions, 'accountsRootEmail' | 'region'>,
): Promise<SetupUpdateInputs> => {
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

export const writeSetupUpdateSummary = (
  summary: Pick<UpdateBlueprintResult, 'createdCount' | 'updatedCount' | 'skippedCount' | 'unchangedCount'>,
  dryRun: boolean,
  output: SetupUpdateOutput,
): void => {
  output.write(`Created files: ${summary.createdCount}\n`);
  output.write(`Updated files: ${summary.updatedCount}\n`);
  output.write(`Skipped files: ${summary.skippedCount}\n`);
  output.write(`Unchanged files: ${summary.unchangedCount}\n`);
  if (dryRun) {
    output.write('Dry run completed. No files were modified.\n');
  }
  output.write('Done. ✅\n');
};

export const runSetupUpdate = async (
  rl: readline.Interface,
  output: SetupUpdateOutput,
  options: SetupUpdateOptions,
): Promise<UpdateBlueprintResult> => {
  const inputs = await resolveSetupUpdateInputs(rl, {
    accountsRootEmail: options.accountsRootEmail,
    region: options.region,
  });

  const onExistingFileDiff = createInteractiveDiffSelector({
    rl,
    autoApply: options.autoApply,
    dryRun: options.dryRun,
    lineMode: options.lineMode,
    stdout: output,
  });

  return updateBlueprint(DEFAULT_BLUEPRINT, {
    accountsRootEmail: inputs.accountsRootEmail,
    region: inputs.region,
    dryRun: options.dryRun,
    onExistingFileDiff,
  });
};
