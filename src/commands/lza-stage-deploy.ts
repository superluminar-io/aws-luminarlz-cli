import { Command, Option } from 'clipanion';
import { synthConfigOut } from '../core/accelerator/config/synth';
import { deployStage, synthStage } from '../core/accelerator/repository/core_cli';
import { customizationsCdkSynth } from '../core/customizations/synth';

export class LzaStageDeploy extends Command {
  static paths = [['lza', 'stage', 'deploy']];

  static usage = Command.Usage({
    category: 'LZA Stage',
    description: 'Deploy a LZA stage.',
    details: `
      This includes synthesizing everything as well as deploying the LZA stage.
    `,
  });
  stage = Option.String('--stage', {
    description: `
      The AWS Accelerator pipeline stage to be synthesized & deployed. Defaults to \`customizations\`.
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
    await deployStage({
      stage,
    });
    console.log(
      `Deployed AWS Accelerator ${stage} stage. ✅`,
    );
  }
}
