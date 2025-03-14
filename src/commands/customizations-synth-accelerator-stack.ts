import { Command, Option } from 'clipanion';
import { awsAcceleratorSynth, customizationsCdkSynth } from '../luminarlz/customizations-synth';

export class CustomizationsSynthAcceleratorStack extends Command {
  static paths = [['customizations', 'synth-accelerator-stack']];

  stackName = Option.String({
    required: true,
  });
  accountId = Option.String({
    required: true,
  });
  region = Option.String({
    required: true,
  });

  async execute() {
    await customizationsCdkSynth(this.stackName);
    await awsAcceleratorSynth({
      accountId: this.accountId,
      region: this.region,
    });
    console.log(
      `Synthesized AWS Accelerator customizations stack: ${this.stackName} for account: ${this.accountId} and region: ${this.region}. ✅`,
    );
  }
}
