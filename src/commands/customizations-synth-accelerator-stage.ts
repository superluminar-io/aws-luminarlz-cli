import { Command, Option } from 'clipanion';
import { awsAcceleratorSynth, customizationsCdkSynth } from '../luminarlz/customizations-synth';

export class CustomizationsSynthAcceleratorStage extends Command {
  static paths = [['customizations', 'synth-accelerator-stage']];

  accountId = Option.String({
    required: true,
  });
  region = Option.String({
    required: true,
  });

  async execute() {
    await customizationsCdkSynth();
    await awsAcceleratorSynth({
      accountId: this.accountId,
      region: this.region,
    });
    console.log(
      'Synthesized AWS Accelerator customizations stage. ✅',
    );
  }
}
