import { Command } from 'clipanion';
import { LzaStage } from './lza-stage';
import { acceleratorConfigOutSynth } from '../luminarlz/accelerator-config-out-synth';
import { customizationsCdkSynth } from '../luminarlz/customizations-synth';
import { awsAcceleratorSynthStage } from '../luminarlz/lza-repository-checkout';

export class LzaStageSynth extends LzaStage {
  static paths = [[...super.namespacePath, 'synth']];

  static usage = Command.Usage({
    category: super.category,
    description: 'Synth a LZA stage.',
    details: `
      This includes synthesizing everything as well as the LZA stage.
    `,
  });

  async execute() {
    const stage = this.stageOrDefault;
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
