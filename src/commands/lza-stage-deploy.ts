import { Command, Option } from 'clipanion';
import { acceleratorConfigOutSynth } from '../luminarlz/accelerator-config-out-synth';
import { customizationsCdkSynth } from '../luminarlz/customizations-synth';
import { awsAcceleratorDeployStage, awsAcceleratorSynthStage } from '../luminarlz/lza-repository-checkout';

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
    await acceleratorConfigOutSynth();
    await awsAcceleratorSynthStage({
      stage,
    });
    await awsAcceleratorDeployStage({
      stage,
    });
    console.log(
      `Deployed AWS Accelerator ${stage} stage. ✅`,
    );
  }
}
