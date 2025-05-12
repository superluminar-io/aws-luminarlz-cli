import { Command, Option } from 'clipanion';
import { acceleratorConfigOutSynth } from '../luminarlz/accelerator-config-out-synth';
import { customizationsCdkSynth } from '../luminarlz/customizations-synth';
import { awsAcceleratorSynthStage } from '../luminarlz/lza-repository-checkout';

export class LzaStageSynth extends Command {
  static paths = [['lza', 'stage', 'synth']];

  static usage = Command.Usage({
    category: 'LZA Stage',
    description: 'Synth a LZA stage.',
    details: `
      This includes synthesizing everything as well as the LZA stage.
    `,
  });
  stage = Option.String('--stage', {
    description: `
      The AWS Accelerator pipeline stage to be synthesized. Defaults to \`customizations\`.
      You can find an overview of the different stages in the Landing Zone Accelerator on AWS pipeline documentation:
      https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html
    `,
  });

  async execute() {
    const stage = this.stage ?? 'customizations';
    await customizationsCdkSynth();
    await acceleratorConfigOutSynth();
    await awsAcceleratorSynthStage({
      stage,
    });
    console.log(
      `Synthesized AWS Accelerator ${stage} stage. ✅`,
    );
  }
}
