import { Command, Option } from 'clipanion';
import { awsAcceleratorSynth, customizationsCdkSynth } from '../luminarlz/customizations-synth';

export class LzaStageSynth extends Command {
  static paths = [['lza', 'stage', 'synth']];

  static usage = Command.Usage({
    category: 'LZA Stage',
    description: 'Synth a LZA stage for an account and optionally a region.',
    details: `
      This includes synthesizing the customizations as well as a LZA stage.
    `,
  });

  accountId = Option.String('--account-id', {
    required: true,
  });
  region = Option.String('--region', {
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
