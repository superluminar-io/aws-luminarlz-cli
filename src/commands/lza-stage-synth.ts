import { Command, Option } from 'clipanion';
import { synthConfigOut } from '../core/accelerator/config/synth';
import { synthStage } from '../core/accelerator/repository/core_cli';
import { customizationsCdkSynth } from '../core/customizations/synth';

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
    await synthConfigOut();
    await synthStage({
      stage,
    });
    console.log(
      `Synthesized AWS Accelerator ${stage} stage. ✅`,
    );
  }
}
