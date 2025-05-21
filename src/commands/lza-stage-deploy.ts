import { Command } from 'clipanion';
import { LzaStage } from './lza-stage';
import { acceleratorConfigOutSynth } from '../luminarlz/accelerator-config-out-synth';
import { customizationsCdkSynth } from '../luminarlz/customizations-synth';
import { awsAcceleratorDeployStage, awsAcceleratorSynthStage } from '../luminarlz/lza-repository-checkout';

export class LzaStageDeploy extends LzaStage {
  static paths = [[...super.namespacePath, 'deploy']];

  static usage = Command.Usage({
    category: super.category,
    description: 'Deploy a LZA stage.',
    details: `
      This includes synthesizing everything as well as deploying the LZA stage.
    `,
  });

  async execute() {
    const stage = this.stageOrDefault;
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
