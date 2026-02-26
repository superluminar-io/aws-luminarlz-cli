import * as readline from 'node:readline/promises';
import { Command, Option } from 'clipanion';
import { blueprintExists, initializeBlueprintFiles } from '../core/blueprint/blueprint';
import { OutputWriter } from '../core/blueprint/blueprint-report';

const AWS_LUMINARLZ_BLUEPRINTS_GITHUB_URL = 'https://github.com/superluminar-io/aws-luminarlz-cli/tree/main/blueprints';

export class Init extends Command {
  static paths = [['init']];

  static usage = Command.Usage({
    description: 'Generate an initial aws-luminarlz project based on a blueprint.',
    details: 'A list of blueprints can be found in the luminarlz repository: ' + AWS_LUMINARLZ_BLUEPRINTS_GITHUB_URL,
    examples: [
      ['Generate a foundational github aws-luminarlz project', '$0 init --blueprint foundational'],
    ],
  });

  blueprint = Option.String('--blueprint', {
    description: 'The name of the blueprint to use for the project. Defaults to `foundational`.',
  });
  force = Option.Boolean('--force', {
    description: 'Force overwrite of existing files.',
  });
  accountsRootEmail = Option.String('--accounts-root-email', {
    description: 'The email address used for the AWS accounts root emails.',
  });
  region = Option.String('--region', {
    description: 'The region the Landing Zone Accelerator on AWS has been installed in (the home region).',
  });

  async execute() {
    const blueprint = this.blueprint || 'foundational';
    if (blueprint !== 'foundational') {
      throw new Error(`Blueprint ${blueprint} is not supported. Please use foundational.`);
    }
    if (!blueprintExists()) {
      throw new Error(`Blueprint ${blueprint} does not exist. Please check the available blueprints at ${AWS_LUMINARLZ_BLUEPRINTS_GITHUB_URL}`);
    }
    const readlineInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      if (!this.accountsRootEmail) {
        this.accountsRootEmail = await readlineInterface.question('Please provide the email address used for the AWS accounts root emails: ');
        if (this.accountsRootEmail.length < 4 || !this.accountsRootEmail.includes('@')) {
          throw new Error(`Invalid email address: ${this.accountsRootEmail}`);
        }
      }
      if (!this.region) {
        this.region = await readlineInterface.question('Please provide the region the Landing Zone Accelerator on AWS has been installed in (the home region): ');
        if (this.region === '') {
          throw new Error(`Invalid region: ${this.region}`);
        }
      }
      const summary = await initializeBlueprintFiles({
        forceOverwrite: this.force || false,
        accountsRootEmail: this.accountsRootEmail,
        region: this.region,
      });
      summary.writeOutput(this.context.stdout as OutputWriter);
    } finally {
      readlineInterface.close();
    }
  }
}
